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

function toCandidates(src: string): string[] {
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
  // 相对路径优先：部分 WebView 对绝对 URL + SW 组合会拿空 body
  const out: string[] = [];
  if (relative) out.push(relative);
  if (absolute && absolute !== relative) out.push(absolute);
  if (absolute && !absolute.includes('?')) out.push(`${absolute}?v=1`);
  return out.filter(Boolean);
}

async function fetchAsBlobUrl(url: string): Promise<string | null> {
  // 生产壁纸常带 no-store；force-cache 在安卓 WebView 上可能直接失败
  const modes: RequestCache[] = ['no-store', 'default', 'force-cache'];
  for (const cache of modes) {
    try {
      const res = await fetch(url, {
        credentials: 'same-origin',
        cache,
      });
      if (!res.ok) continue;
      const blob = await res.blob();
      if (blob.size < 200) continue;
      if (blob.type && !blob.type.startsWith('image/') && blob.size < 800) continue;
      return URL.createObjectURL(blob);
    } catch {
      /* try next */
    }
  }
  return null;
}

function paintParentBackground(
  img: HTMLImageElement,
  src: string,
  objectPosition: string,
): void {
  try {
    const parent = img.parentElement;
    if (!(parent instanceof HTMLElement)) return;
    const paint = `url("${img.currentSrc || src}")`;
    parent.style.setProperty('background-image', paint);
    parent.style.setProperty('background-size', 'cover');
    parent.style.setProperty('background-position', objectPosition);
    parent.style.setProperty('background-repeat', 'no-repeat');
    parent.dataset.wallpaperPaint = '1';
  } catch {
    /* ignore */
  }
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
  const [displaySrc, setDisplaySrc] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const candidatesRef = useRef<string[]>([]);
  const blobRef = useRef<string | null>(null);
  const readyRef = useRef(false);
  const blobTriedRef = useRef(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const onReadyRef = useRef(onReady);
  const onFailRef = useRef(onFail);
  onReadyRef.current = onReady;
  onFailRef.current = onFail;

  const markReady = (img: HTMLImageElement, url: string) => {
    if (readyRef.current) {
      paintParentBackground(img, url, objectPosition);
      return;
    }
    paintParentBackground(img, url, objectPosition);
    readyRef.current = true;
    onReadyRef.current?.();
  };

  useEffect(() => {
    readyRef.current = false;
    blobTriedRef.current = false;
    if (!src) {
      candidatesRef.current = [];
      setDisplaySrc(null);
      setAttempt(0);
      onFailRef.current?.();
      return;
    }

    const candidates = toCandidates(src);
    candidatesRef.current = candidates;
    if (blobRef.current) {
      URL.revokeObjectURL(blobRef.current);
      blobRef.current = null;
    }
    setDisplaySrc(candidates[0] || null);
    setAttempt(0);

    // 壳内并行预取 blob：不等 onError，避免「解码成功但不绘制」死等
    let cancelled = false;
    if (isPeiaiAndroidShell()) {
      blobTriedRef.current = true;
      void (async () => {
        for (const url of candidates) {
          if (cancelled || readyRef.current) return;
          const b = await fetchAsBlobUrl(url);
          if (cancelled || !b) continue;
          if (blobRef.current) URL.revokeObjectURL(blobRef.current);
          blobRef.current = b;
          candidatesRef.current = [b];
          setDisplaySrc(b);
          setAttempt(0);
          return;
        }
      })();
    }

    return () => {
      cancelled = true;
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current);
        blobRef.current = null;
      }
    };
  }, [src]);

  if (!displaySrc) return null;

  const tryBlobFallback = () => {
    if (blobTriedRef.current) return false;
    blobTriedRef.current = true;
    const urls = candidatesRef.current.filter((u) => !u.startsWith('blob:'));
    void (async () => {
      for (const url of urls) {
        const b = await fetchAsBlobUrl(url);
        if (b) {
          if (blobRef.current) URL.revokeObjectURL(blobRef.current);
          blobRef.current = b;
          candidatesRef.current = [b];
          setDisplaySrc(b);
          setAttempt(0);
          return;
        }
      }
      onFailRef.current?.();
    })();
    return true;
  };

  const tryNextOrFail = () => {
    if (readyRef.current) return;
    const list = candidatesRef.current;
    const next = attempt + 1;
    if (next < list.length) {
      setAttempt(next);
      setDisplaySrc(list[next]);
      return;
    }
    if (tryBlobFallback()) return;
    onFailRef.current?.();
  };

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={imgRef}
      className={className}
      src={displaySrc}
      alt={alt}
      decoding="async"
      loading={fetchPriority === 'high' ? 'eager' : 'lazy'}
      fetchPriority={fetchPriority}
      draggable={false}
      style={{ objectPosition }}
      onLoad={(e) => {
        const img = e.currentTarget;
        if (img.naturalWidth < 2 || img.naturalHeight < 2) {
          tryNextOrFail();
          return;
        }
        markReady(img, displaySrc);
      }}
      onError={() => {
        tryNextOrFail();
      }}
    />
  );
}

export default WallpaperBg;
