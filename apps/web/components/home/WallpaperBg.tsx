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
  const out: string[] = [];
  // 绝对 URL 在壳 WebView 更稳，优先直出以加快首屏
  if (absolute) out.push(absolute);
  if (relative && relative !== absolute) out.push(relative);
  if (absolute && !absolute.includes('?')) {
    out.push(`${absolute}?v=1`);
  }
  return out.filter(Boolean);
}

async function fetchAsBlobUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      credentials: 'same-origin',
      cache: 'force-cache',
      mode: 'same-origin',
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (blob.size < 200) return null;
    if (blob.type && !blob.type.startsWith('image/')) return null;
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

/**
 * 卡面风景铺底。
 * 直出 URL 抢首帧；壳内若直链失败再走 blob 兜底（旧 WebView 缓存异常）。
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
  const onReadyRef = useRef(onReady);
  const onFailRef = useRef(onFail);
  onReadyRef.current = onReady;
  onFailRef.current = onFail;

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

    return () => {
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current);
        blobRef.current = null;
      }
    };
  }, [src]);

  if (!displaySrc) return null;

  const tryBlobFallback = () => {
    if (blobTriedRef.current || !isPeiaiAndroidShell()) return false;
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
      className={className}
      src={displaySrc}
      alt={alt}
      decoding="async"
      fetchPriority={fetchPriority}
      draggable={false}
      style={{ objectPosition }}
      onLoad={(e) => {
        const img = e.currentTarget;
        if (img.naturalWidth < 2 || img.naturalHeight < 2) {
          tryNextOrFail();
          return;
        }
        try {
          const parent = img.parentElement;
          if (parent instanceof HTMLElement) {
            const paint = `url("${img.currentSrc || displaySrc}")`;
            parent.style.setProperty('background-image', paint);
            parent.style.setProperty('background-size', 'cover');
            parent.style.setProperty('background-position', objectPosition);
            parent.style.setProperty('background-repeat', 'no-repeat');
            parent.dataset.wallpaperPaint = '1';
          }
        } catch {
          /* ignore */
        }
        if (!readyRef.current) {
          readyRef.current = true;
          onReadyRef.current?.();
        }
      }}
      onError={() => {
        tryNextOrFail();
      }}
    />
  );
}

export default WallpaperBg;
