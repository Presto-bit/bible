'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DailyVerse } from '@/lib/api';
import { heroThemeClass } from '@/lib/home_rail';

export default function DailyVerseWallpaper({
  dv,
  illustrationUrl,
  onClose,
}: {
  dv: DailyVerse;
  illustrationUrl?: string | null;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const themeClass = heroThemeClass(dv.theme);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div className={`verse-full ${themeClass}`} onClick={onClose} role="dialog" aria-modal="true" aria-label="每日经文">
      {illustrationUrl ? (
        <div
          className="verse-full-bg verse-full-bg-photo"
          style={{ backgroundImage: `url(${illustrationUrl})` }}
          aria-hidden
        />
      ) : (
        <div className="verse-full-bg verse-full-bg-gradient" aria-hidden />
      )}
      <div className="verse-full-scrim" />
      <div className="verse-full-glow" aria-hidden />
      <button
        type="button"
        className="verse-full-close"
        aria-label="关闭"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        ✕
      </button>
      <div className="verse-full-inner" onClick={(e) => e.stopPropagation()}>
        <p className="verse-full-kicker">每日经文</p>
        <div className="verse-full-ornament" aria-hidden>
          ✦
        </div>
        {dv.ref ? <p className="verse-full-ref">{dv.ref}</p> : null}
        <p className="verse-full-text">「{dv.text}」</p>
        {dv.theme ? <p className="verse-full-theme">{dv.theme}系列</p> : null}
      </div>
    </div>,
    document.body,
  );
}
