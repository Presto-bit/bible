'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, type DailyVerse } from '@/lib/api';
import { dailyVerseWallpaperUrl } from '@/lib/daily_verse_wallpaper';
import { shareCard } from '@/lib/share_card';

export default function DailyVerseWallpaper({
  dv,
  liked,
  likeCount,
  likeBusy,
  likeErr,
  onToggleLike,
  onClose,
}: {
  dv: DailyVerse;
  liked: boolean;
  likeCount: number;
  likeBusy: boolean;
  likeErr: string | null;
  onToggleLike: () => void;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [shared, setShared] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const wallpaperBg = dailyVerseWallpaperUrl(dv.day);

  useEffect(() => {
    setMounted(true);
    const img = new Image();
    img.src = wallpaperBg;
  }, [wallpaperBg]);

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

  const handleShare = useCallback(async () => {
    if (shareBusy) return;
    setShareBusy(true);
    try {
      const ok = await shareCard({
        title: dv.ref,
        subtitle: dv.theme ? `${dv.theme}系列` : undefined,
        body: dv.text,
      });
      if (ok) {
        setShared(true);
        if (dv.day) {
          try {
            await api.recordDailyVerseShare(dv.day);
          } catch {
            /* 离线忽略 */
          }
        }
      }
    } finally {
      setShareBusy(false);
    }
  }, [shareBusy, dv]);

  if (!mounted) return null;

  return createPortal(
    <div className="verse-full" onClick={onClose} role="dialog" aria-modal="true" aria-label="每日经文壁纸">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={wallpaperBg}
        alt=""
        className="verse-full-bg"
        decoding="sync"
        fetchPriority="high"
      />
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
        <div className="verse-full-actions">
          <button
            type="button"
            className={`verse-full-like${liked ? ' verse-full-like-active' : ''}`}
            disabled={likeBusy || !dv.day}
            aria-pressed={liked}
            onClick={onToggleLike}
          >
            ♥ {likeCount.toLocaleString()} 人点赞
          </button>
          <button
            type="button"
            className="verse-full-btn"
            disabled={shareBusy}
            onClick={handleShare}
          >
            {shared ? '已生成图 ✓' : '分享 / 壁纸'}
          </button>
        </div>
        {likeErr ? (
          <p className="verse-full-like-err" role="alert">
            {likeErr}
          </p>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
