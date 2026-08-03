'use client';

import { useEffect, useRef, useState } from 'react';
import { clientAssetUrl } from '@/lib/basePath';
import { isAndroid, isPeiaiAndroidShell } from '@/lib/pwa_platform';

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
  // 绝对 URL 在 TWA WebView 更稳
  if (absolute) out.push(absolute);
  if (relative && relative !== absolute) out.push(relative);
  // 缓存破除 query（生产若 304 坏缓存时的最后手段）
  if (absolute && !absolute.includes('?')) {
    out.push(`${absolute}?v=1`);
  }
  return out.filter(Boolean);
}

async function fetchAsBlobUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      credentials: 'same-origin',
      cache: 'no-store',
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
 * 卡面风景铺底。TWA/安卓：blob 优先 + 真实 img onLoad 校验。
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
  const onReadyRef = useRef(onReady);
  const onFailRef = useRef(onFail);
  onReadyRef.current = onReady;
  onFailRef.current = onFail;

  useEffect(() => {
    readyRef.current = false;
    if (!src) {
      candidatesRef.current = [];
      setDisplaySrc(null);
      setAttempt(0);
      onFailRef.current?.();
      return;
    }

    let cancelled = false;
    const shellish =
      typeof navigator !== 'undefined' && (isPeiaiAndroidShell() || isAndroid());
    const candidates = toCandidates(src);
    candidatesRef.current = candidates;

    const revokeBlob = () => {
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current);
        blobRef.current = null;
      }
    };
    revokeBlob();
    setAttempt(0);

    void (async () => {
      if (shellish) {
        for (const url of candidates) {
          if (cancelled) return;
          const b = await fetchAsBlobUrl(url);
          if (cancelled) {
            if (b) URL.revokeObjectURL(b);
            return;
          }
          if (b) {
            revokeBlob();
            blobRef.current = b;
            candidatesRef.current = [b];
            setDisplaySrc(b);
            setAttempt(0);
            return;
          }
        }
      }
      if (cancelled) return;
      setDisplaySrc(candidates[0] || null);
      setAttempt(0);
    })();

    return () => {
      cancelled = true;
      revokeBlob();
    };
  }, [src]);

  if (!displaySrc) return null;

  const tryNextOrFail = () => {
    if (readyRef.current) return;
    const list = candidatesRef.current;
    const next = attempt + 1;
    if (next < list.length) {
      setAttempt(next);
      setDisplaySrc(list[next]);
      return;
    }
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
            parent.style.backgroundImage = `url("${img.currentSrc || displaySrc}")`;
            parent.style.backgroundSize = 'cover';
            parent.style.backgroundPosition = objectPosition;
            parent.style.backgroundRepeat = 'no-repeat';
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
