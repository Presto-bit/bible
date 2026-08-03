'use client';

import { useEffect, useState } from 'react';
import { clientAssetUrl } from '@/lib/basePath';

type Props = {
  /** 站点相对路径或绝对 URL，如 /daily-wallpapers/scenery-01.jpg */
  src: string | null | undefined;
  className?: string;
  /** object-fit 位置 */
  objectPosition?: string;
  fetchPriority?: 'high' | 'low' | 'auto';
  alt?: string;
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
  // 同源相对路径更稳（SW 旁路 + 原生缓存）；绝对路径作备用
  if (relative) out.push(relative);
  if (absolute && absolute !== relative) out.push(absolute);
  return out;
}

/**
 * 安卓 WebView 可靠铺底：只用 <img>，避免 CSS background / force-cache blob 黑洞。
 * 失败链路：relative → absolute → blob(no-store)。
 */
export function WallpaperBg({
  src,
  className,
  objectPosition = 'center',
  fetchPriority = 'auto',
  alt = '',
}: Props) {
  const [displaySrc, setDisplaySrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!src) {
      setDisplaySrc(null);
      setFailed(false);
      return;
    }
    let cancelled = false;
    let blobUrl: string | null = null;
    const candidates = toCandidates(src);

    setFailed(false);
    setDisplaySrc(candidates[0] || null);

    const tryBlob = async (url: string) => {
      try {
        const res = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
        if (!res.ok) return null;
        const blob = await res.blob();
        if (blob.size < 200) return null;
        if (blob.type && !blob.type.startsWith('image/') && blob.size < 800) return null;
        return URL.createObjectURL(blob);
      } catch {
        return null;
      }
    };

    const probe = (url: string) =>
      new Promise<boolean>((resolve) => {
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = url;
      });

    void (async () => {
      for (const url of candidates) {
        if (cancelled) return;
        setDisplaySrc(url);
        const ok = await probe(url);
        if (cancelled) return;
        if (ok) {
          setFailed(false);
          return;
        }
      }
      for (const url of candidates) {
        if (cancelled) return;
        const b = await tryBlob(url);
        if (cancelled) {
          if (b) URL.revokeObjectURL(b);
          return;
        }
        if (b) {
          blobUrl = b;
          setDisplaySrc(b);
          setFailed(false);
          return;
        }
      }
      if (!cancelled) setFailed(true);
    })();

    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [src]);

  if (!displaySrc || failed) return null;

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
    />
  );
}

export default WallpaperBg;
