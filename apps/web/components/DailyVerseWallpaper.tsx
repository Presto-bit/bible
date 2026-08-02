'use client';

import '@/styles/verse_fullscreen.css';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DailyVerse, DailyVerseReactPreset } from '@/lib/api';
import { dailyVerseWallpaperUrl } from '@/lib/daily_verse_wallpaper';
import { formatDailyVerseQuote } from '@/lib/daily_verse_display';
import { applyAppTheme } from '@/lib/app_theme';

type Props = {
  dv: DailyVerse;
  backgroundUrl?: string | null;
  onClose: () => void;
  liked: boolean;
  likeCount: number;
  likeBusy?: boolean;
  onToggleLike: () => void;
  myReact: DailyVerseReactPreset | null;
  reactCount: number;
  onOpenReact: () => void;
  onAskXiaoAi?: () => void;
  onShare: () => void;
  shareBusy?: boolean;
};

export default function DailyVerseWallpaper({
  dv,
  backgroundUrl,
  onClose,
  liked,
  likeCount,
  likeBusy,
  onToggleLike,
  myReact,
  reactCount,
  onOpenReact,
  onAskXiaoAi,
  onShare,
  shareBusy,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [bgOk, setBgOk] = useState(true);

  const fullUrl = backgroundUrl ?? dailyVerseWallpaperUrl(dv.day, 'full');
  const cardUrl = dailyVerseWallpaperUrl(dv.day, 'card');
  const shareCount = dv.shares_count ?? 0;

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

      <div
        className="verse-full-dock"
        onClick={(e) => e.stopPropagation()}
        role="toolbar"
        aria-label="经文互动"
      >
        <button
          type="button"
          className={`verse-full-dock-btn${liked ? ' is-active' : ''}`}
          disabled={likeBusy || !dv.day}
          aria-pressed={liked}
          aria-label={liked ? '取消点赞' : '点赞'}
          onClick={() => void onToggleLike()}
        >
          {liked ? (
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
              <path
                fill="currentColor"
                d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
              />
            </svg>
          ) : (
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              aria-hidden
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          )}
          {likeCount > 0 ? <span>{likeCount.toLocaleString()}</span> : null}
        </button>

        <button
          type="button"
          className={`verse-full-dock-btn${myReact ? ' is-active' : ''}`}
          disabled={!dv.day}
          aria-pressed={!!myReact}
          aria-label={myReact ? `我的回应：${myReact.label}` : '回应'}
          onClick={onOpenReact}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            aria-hidden
            fill={myReact ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
          {reactCount > 0 ? <span>{reactCount.toLocaleString()}</span> : null}
        </button>

        <button
          type="button"
          className="verse-full-dock-btn verse-full-dock-xiaoai"
          disabled={!dv.ref || !onAskXiaoAi}
          aria-label={dv.ref ? `用小爱解读：${dv.ref}` : '用小爱解读'}
          onClick={() => onAskXiaoAi?.()}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden fill="currentColor">
            <path d="M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12zM19 15l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25z" />
          </svg>
        </button>

        <button
          type="button"
          className="verse-full-dock-btn"
          disabled={shareBusy || !dv.text}
          aria-label="分享"
          onClick={() => void onShare()}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            aria-hidden
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <path d="M8.59 13.51 15.42 17.49M15.41 6.51 8.59 10.49" />
          </svg>
          {shareCount > 0 ? <span>{shareCount.toLocaleString()}</span> : null}
        </button>
      </div>
    </div>,
    document.body,
  );
}
