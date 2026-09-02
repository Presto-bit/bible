'use client';

import { useEffect, useRef } from 'react';
import AppBodyPortal from '@/components/AppBodyPortal';
import type { AudioTimestampVerse, ReaderAudioState } from '@/lib/reader_audio';
import { useHorizontalSwipeAction } from '@/lib/use_horizontal_swipe_action';
import { useSheetOpenGuard } from '@/lib/use_sheet_open_guard';
import { SHEET_OPEN_GUARD_MS } from '@/lib/reader_gesture';
import { useVerticalSwipeDismiss } from '@/lib/use_vertical_swipe_dismiss';

export function ReaderAudioFocus({
  open,
  title,
  subtitle,
  state,
  currentSec,
  durationSec,
  formatTime,
  verses,
  timestamps,
  currentVerse,
  onMinimize,
  onToggle,
  onSeek,
  onSeekToVerse,
  onOpenSettings,
  onStop,
  onRetry,
  canPrevChapter = false,
  canNextChapter = false,
  onPrevChapter,
  onNextChapter,
}: {
  open: boolean;
  title: string;
  subtitle: string;
  state: ReaderAudioState;
  currentSec: number;
  durationSec: number;
  formatTime: (n: number) => string;
  verses: { verse: number; text: string }[];
  timestamps: AudioTimestampVerse[];
  currentVerse: number | null;
  onMinimize: () => void;
  onToggle: () => void;
  onSeek: (delta: number) => void;
  onSeekToVerse: (sec: number) => void;
  onOpenSettings: () => void;
  onStop: () => void;
  onRetry?: () => void;
  canPrevChapter?: boolean;
  canNextChapter?: boolean;
  onPrevChapter?: () => void;
  onNextChapter?: () => void;
}) {
  const lyricsRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const { guardedClose } = useSheetOpenGuard(SHEET_OPEN_GUARD_MS);
  const swipe = useVerticalSwipeDismiss({
    onDismiss: onMinimize,
    scrollRef: lyricsRef,
    dismissFromHeaderOnly: true,
    headerRef,
  });
  const horizontal = useHorizontalSwipeAction({
    onSwipeRight: onMinimize,
  });

  const playing = state === 'playing';
  const loading = state === 'loading';
  const errored = state === 'error';
  const pct = durationSec > 0 ? Math.min(100, (currentSec / durationSec) * 100) : 0;
  const hasLyrics = timestamps.length > 0 && verses.length > 0;
  const dragX = horizontal.dragX > 0 ? horizontal.dragX : 0;
  const dragY = swipe.dragOffset > 0 ? swipe.dragOffset : 0;
  const dragStyle =
    dragX || dragY
      ? { transform: `translate(${dragX}px, ${dragY}px)`, transition: 'none' as const }
      : undefined;

  useEffect(() => {
    if (!open || !hasLyrics || !currentVerse) return;
    const el = lyricsRef.current?.querySelector(`[data-verse="${currentVerse}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [open, currentVerse, hasLyrics]);

  if (!open) return null;

  return (
    <AppBodyPortal onTabAway={onMinimize}>
    <div className="reader-audio-focus-backdrop" onClick={() => guardedClose(onMinimize)}>
      <div
        className={[
          'reader-audio-focus',
          loading ? 'is-loading' : '',
          errored ? 'is-error' : '',
        ].filter(Boolean).join(' ')}
        style={dragStyle}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => {
          horizontal.onTouchStart(e);
          swipe.onTouchStart(e);
        }}
        onTouchMove={(e) => {
          horizontal.onTouchMove(e);
          swipe.onTouchMove(e);
        }}
        onTouchEnd={(e) => {
          horizontal.onTouchEnd(e);
          swipe.onTouchEnd(e);
        }}
        onTouchCancel={(e) => {
          horizontal.onTouchCancel(e);
          swipe.onTouchCancel(e);
        }}
        role="dialog"
        aria-modal="true"
        aria-label="本章朗读"
      >
        <div className="reader-audio-focus-head" ref={headerRef}>
          <div className="half-sheet-grab" aria-hidden />
          <button type="button" className="reader-audio-focus-back" onClick={onMinimize}>
            回到阅读
          </button>
        </div>
        <h2 className="reader-audio-focus-title">{title}</h2>
        <p className="reader-audio-focus-sub">{subtitle}</p>

        {loading ? (
          <p className="reader-audio-focus-status" role="status">正在加载本章朗读…</p>
        ) : null}
        {errored ? (
          <div className="reader-audio-focus-status reader-audio-focus-status-error">
            <p role="alert">朗读加载失败</p>
            {onRetry ? (
              <button type="button" className="reader-audio-focus-retry" onClick={onRetry}>
                重试
              </button>
            ) : null}
          </div>
        ) : null}

        {hasLyrics && !loading && !errored ? (
          <div className="reader-audio-focus-lyrics" ref={lyricsRef}>
            {verses.map((v) => {
              const ts = timestamps.find((t) => t.verse === v.verse);
              const active = currentVerse === v.verse;
              return (
                <button
                  key={v.verse}
                  type="button"
                  data-verse={v.verse}
                  className={`reader-audio-focus-verse${active ? ' is-active' : ''}`}
                  disabled={!ts}
                  onClick={() => {
                    if (ts) onSeekToVerse(ts.start_ms / 1000);
                  }}
                >
                  <span className="reader-audio-focus-verse-no">{v.verse}</span>
                  <span className="reader-audio-focus-verse-text">{v.text}</span>
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="reader-audio-focus-progress">
          <div className="reader-audio-focus-bar" style={{ width: `${pct}%` }} />
        </div>
        <p className="reader-audio-focus-time">
          {loading
            ? '加载中…'
            : errored
              ? '—'
              : `${formatTime(currentSec)} / ${formatTime(durationSec)}`}
        </p>
        <div className="reader-audio-focus-controls">
          <button
            type="button"
            className="reader-audio-focus-ctl"
            onClick={onPrevChapter}
            disabled={loading || errored || !canPrevChapter || !onPrevChapter}
            aria-label="上一章"
          >
            上一章
          </button>
          <button
            type="button"
            className="reader-audio-focus-ctl"
            onClick={() => onSeek(-15)}
            disabled={loading || errored}
            aria-label="后退 15 秒"
          >
            −15s
          </button>
          <button
            type="button"
            className="reader-audio-focus-main"
            onClick={onToggle}
            disabled={loading}
            aria-label={playing ? '暂停' : '播放'}
          >
            {playing ? '‖' : '▶'}
          </button>
          <button
            type="button"
            className="reader-audio-focus-ctl"
            onClick={() => onSeek(15)}
            disabled={loading || errored}
            aria-label="快进 15 秒"
          >
            +15s
          </button>
          <button
            type="button"
            className="reader-audio-focus-ctl"
            onClick={onNextChapter}
            disabled={loading || errored || !canNextChapter || !onNextChapter}
            aria-label="下一章"
          >
            下一章
          </button>
        </div>
        <div className="reader-audio-focus-links">
          <button type="button" onClick={onOpenSettings}>设置</button>
          <button type="button" className="reader-audio-focus-stop" onClick={onStop}>结束朗读</button>
        </div>
      </div>
    </div>
    </AppBodyPortal>
  );
}
