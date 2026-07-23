'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DailyVerse } from '@/lib/api';
import { dailyVerseWallpaperUrl } from '@/lib/daily_verse_wallpaper';
import { formatDailyVerseQuote } from '@/lib/daily_verse_display';
import { applyAppTheme } from '@/lib/app_theme';

export default function DailyVerseWallpaper({
  dv,
  backgroundUrl,
  onClose,
}: {
  dv: DailyVerse;
  backgroundUrl?: string | null;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [bgOk, setBgOk] = useState(true);

  const fullUrl = backgroundUrl ?? dailyVerseWallpaperUrl(dv.day, 'full');
  const cardUrl = dailyVerseWallpaperUrl(dv.day, 'card');

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setBgOk(true);
  }, [fullUrl]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.classList.add('verse-full-open');
    document.body.style.overflow = 'hidden';
    const meta = document.querySelector('meta[name="theme-color"]');
    const prevTheme = meta?.getAttribute('content') ?? '';
    meta?.setAttribute('content', '#000000');
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('verse-full-open');
      document.body.style.overflow = prevOverflow;
      if (prevTheme) meta?.setAttribute('content', prevTheme);
      else applyAppTheme();
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  if (!mounted) return null;

  const showPhoto = Boolean(fullUrl && bgOk);

  return createPortal(
    <div
      className="verse-full verse-full-photo-only"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={dv.ref ? `每日经文 ${dv.ref}` : '每日经文'}
    >
      {showPhoto ? (
        <img
          className="verse-full-bg verse-full-bg-photo"
          src={fullUrl}
          srcSet={`${cardUrl} 1200w, ${fullUrl} 2400w`}
          sizes="100vw"
          alt=""
          aria-hidden
          decoding="async"
          fetchPriority="high"
          onError={() => setBgOk(false)}
        />
      ) : (
        <div className="verse-full-bg verse-full-bg-gradient" aria-hidden />
      )}
      <div className="verse-full-scrim-top" aria-hidden />
      <div className="verse-full-inner" onClick={(e) => e.stopPropagation()}>
        <div className="verse-full-copy">
          <p className="verse-full-text">{formatDailyVerseQuote(dv.text)}</p>
          {dv.ref ? <p className="verse-full-ref">{dv.ref}</p> : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
