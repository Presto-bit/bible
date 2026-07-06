'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DailyVerse } from '@/lib/api';

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

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setBgOk(true);
  }, [backgroundUrl]);

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

  const showPhoto = Boolean(backgroundUrl && bgOk);

  return createPortal(
    <div
      className="verse-full verse-full-photo-only"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="每日经文"
    >
      {showPhoto ? (
        <img
          className="verse-full-bg verse-full-bg-photo"
          src={backgroundUrl!}
          alt=""
          aria-hidden
          onError={() => setBgOk(false)}
        />
      ) : (
        <div className="verse-full-bg verse-full-bg-gradient" aria-hidden />
      )}
      <div className="verse-full-inner" onClick={(e) => e.stopPropagation()}>
        <p className="verse-full-kicker">每日经文</p>
        <div className="verse-full-ornament" aria-hidden>
          ✦
        </div>
        {dv.ref ? <p className="verse-full-ref">{dv.ref}</p> : null}
        <p className="verse-full-text">「{dv.text}」</p>
      </div>
    </div>,
    document.body,
  );
}
