'use client';

import { useEffect, useRef, useState } from 'react';
import { clientAssetUrl } from '@/lib/basePath';
import { isPeiaiAndroidShell } from '@/lib/pwa_platform';

type Props = {
  /** 站点相对路径或绝对 URL，如 /daily-wallpapers/scenery-01.jpg */
  src: string | null | undefined;
  className?: string;
  /** object-fit 位置 */
  objectPosition?: string;
  fetchPriority?: 'high' | 'low' | 'auto';
  alt?: string;
  /** 实际解码成功（可用 naturalWidth 校验） */
  onReady?: () => void;
  /** 全部候选失败 */
  onFail?: () => void;
};

function toCandidates(src: string, shell: boolean): string[] {
  if (src.startsWith('blob:') || src.startsWith('data:')) return [src];
  const absolute = /^https?:\/\//i.test(src) ? src : clientAssetUrl(src);
  let relative = src;
  if (/^https?:\/\//i.test(src)) {
    try {
      const u = new URL(src);
      relative = `${u.pathname}${u.search}`;
    } catch {
      relative = src;
    }
  } else if (!src.startsWith('/')) {
    relative = `/${src}`;
  }
  // 壳：绝对 URL 优先（部分 WebView 相对路径 + 历史 SW 易空 body）
  // 浏览器：相对优先（同源直出）
  const out: string[] = [];
  if (shell) {
    if (absolute) out.push(absolute);
    if (relative && relative !== absolute) out.push(relative);
  } else {
    if (relative) out.push(relative);
    if (absolute && absolute !== relative) out.push(absolute);
  }
  return out.filter(Boolean);
}

async function fetchAsBlobUrl(url: string): Promise<string | null> {
  // 生产壁纸常带 no-store；优先 default（可走磁盘）；再 no-store
  const modes: RequestCache[] = ['default', 'no-store'];
  for (const cache of modes) {
    try {
      const res = await fetch(url, {
        credentials: 'same-origin',
        cache,
        mode: 'same-origin',
      });
      if (!res.ok) continue;
      const blob = await res.blob();
      if (blob.size < 200) continue;
      if (blob.type && !blob.type.startsWith('image/') && blob.size < 800) continue;
      // 无 type 也认 JPEG 魔数（部分网关缺 Content-Type）
      if (!blob.type || blob.type === 'application/octet-stream') {
        const head = new Uint8Array(await blob.slice(0, 3).arrayBuffer());
        const isJpeg = head[0] === 0xff && head[1] === 0xd8;
        const isPng = head[0] === 0x89 && head[1] === 0x50;
        if (!isJpeg && !isPng && blob.size < 2000) continue;
      }
      return URL.createObjectURL(blob);
    } catch {
      /* try next */
    }
  }
  return null;
}

function paintParentBackground(
  host: HTMLElement | null,
  src: string,
  objectPosition: string,
): void {
  try {
    if (!(host instanceof HTMLElement)) return;
    // url() 用单引号；blob/带引号路径更稳
    const safe = src.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    host.style.setProperty('background-image', `url('${safe}')`);
    host.style.setProperty('background-size', 'cover');
    host.style.setProperty('background-position', objectPosition);
    host.style.setProperty('background-repeat', 'no-repeat');
    host.dataset.wallpaperPaint = '1';
  } catch {
    /* ignore */
  }
}

function clearParentBackground(host: HTMLElement | null): void {
  if (!(host instanceof HTMLElement)) return;
  if (host.dataset.wallpaperPaint !== '1') return;
  host.style.removeProperty('background-image');
  delete host.dataset.wallpaperPaint;
}

/**
 * 卡面风景铺底。
 * 直出 URL 抢首帧；壳内并行 blob（规避 img 解码成功却不绘制）；父层 CSS 背景双保险。
 */
export function WallpaperBg({
  src,
  className,
  objectPosition = 'center',
  fetchPriority = 'auto',
  alt = '',
  onReady,
  onFail,
}: Props) {
  const shell = isPeiaiAndroidShell();
  const [displaySrc, setDisplaySrc] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const candidatesRef = useRef<string[]>([]);
  const blobRef = useRef<string | null>(null);
  const readyRef = useRef(false);
  const genRef = useRef(0);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const hostRef = useRef<HTMLElement | null>(null);
  const pendingPaintRef = useRef<string | null>(null);
  const onReadyRef = useRef(onReady);
  const onFailRef = useRef(onFail);
  onReadyRef.current = onReady;
  onFailRef.current = onFail;

  const applyHostPaint = (host: HTMLElement | null, url: string) => {
    if (host) {
      paintParentBackground(host, url, objectPosition);
      pendingPaintRef.current = null;
    } else {
      pendingPaintRef.current = url;
    }
  };

  const markReady = (url: string, img?: HTMLImageElement | null) => {
    const host = hostRef.current || img?.parentElement || null;
    if (host) hostRef.current = host;
    applyHostPaint(host, url);
    if (readyRef.current) return;
    readyRef.current = true;
    onReadyRef.current?.();
  };

  useEffect(() => {
    const gen = ++genRef.current;
    readyRef.current = false;
    clearParentBackground(hostRef.current);

    if (!src) {
      candidatesRef.current = [];
      setDisplaySrc(null);
      setAttempt(0);
      onFailRef.current?.();
      return;
    }

    const candidates = toCandidates(src, shell);
    candidatesRef.current = candidates;
    const oldBlob = blobRef.current;
    blobRef.current = null;
    // 延后 revoke，避免 React 卸旧 img 前 URL 失效
    if (oldBlob) {
      window.setTimeout(() => {
        try {
          URL.revokeObjectURL(oldBlob);
        } catch {
          /* ignore */
        }
      }, 2_000);
    }

    setDisplaySrc(candidates[0] || null);
    setAttempt(0);

    // 壳：用 Image 预解码 + 并行 blob，任一条先成功即 paint
    let cancelled = false;
    const tryPaintFromUrl = (url: string) =>
      new Promise<boolean>((resolve) => {
        const probe = new Image();
        probe.decoding = 'async';
        probe.onload = () => {
          if (cancelled || gen !== genRef.current) {
            resolve(false);
            return;
          }
          if (probe.naturalWidth < 2) {
            resolve(false);
            return;
          }
          markReady(url);
          // 同步切到该 URL 展示（若尚未）
          setDisplaySrc((prev) => (prev === url ? prev : url));
          resolve(true);
        };
        probe.onerror = () => resolve(false);
        probe.src = url;
      });

    void (async () => {
      // 先并行试所有网络候选，提升弱网成功率
      for (const url of candidates) {
        if (cancelled || gen !== genRef.current || readyRef.current) return;
        const ok = await tryPaintFromUrl(url);
        if (ok) return;
      }
      if (cancelled || gen !== genRef.current || readyRef.current) return;
      // 再 blob
      for (const url of candidates) {
        if (cancelled || gen !== genRef.current || readyRef.current) return;
        const b = await fetchAsBlobUrl(url);
        if (!b || cancelled || gen !== genRef.current) continue;
        if (blobRef.current) {
          const prev = blobRef.current;
          window.setTimeout(() => {
            try {
              URL.revokeObjectURL(prev);
            } catch {
              /* ignore */
            }
          }, 2_000);
        }
        blobRef.current = b;
        candidatesRef.current = [b, ...candidates];
        setDisplaySrc(b);
        setAttempt(0);
        const ok = await tryPaintFromUrl(b);
        if (ok) return;
      }
      if (!cancelled && gen === genRef.current && !readyRef.current) {
        onFailRef.current?.();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [src, shell, objectPosition]);

  useEffect(() => {
    // 卸载时清父层 inline（仅当是我们刷的）
    return () => {
      clearParentBackground(hostRef.current);
    };
  }, []);

  if (!displaySrc) return null;

  const onImgReady = (img: HTMLImageElement) => {
    if (img.naturalWidth < 2 || img.naturalHeight < 2) {
      // 交由 effect 里的并行路径处理失败
      return;
    }
    hostRef.current = img.parentElement;
    markReady(displaySrc, img);
  };

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={(node) => {
        imgRef.current = node;
        if (node?.parentElement) {
          hostRef.current = node.parentElement;
          if (pendingPaintRef.current) {
            applyHostPaint(node.parentElement, pendingPaintRef.current);
          }
        }
        // 已缓存解码完成时有的 WebView 不重放 onLoad
        if (node && node.complete && node.naturalWidth > 1) {
          onImgReady(node);
        }
      }}
      className={className}
      src={displaySrc}
      alt={alt}
      decoding="async"
      loading={fetchPriority === 'high' ? 'eager' : 'lazy'}
      fetchPriority={fetchPriority}
      draggable={false}
      style={{ objectPosition }}
      onLoad={(e) => onImgReady(e.currentTarget)}
      onError={() => {
        // 切下一条候选；并行 Image/blob 路径仍会继续
        if (readyRef.current) return;
        const list = candidatesRef.current;
        const next = attempt + 1;
        if (next < list.length) {
          setAttempt(next);
          setDisplaySrc(list[next]);
        }
      }}
    />
  );
}

export default WallpaperBg;
