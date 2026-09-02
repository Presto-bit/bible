'use client';

import type { ReaderAudioState } from '@/lib/reader_audio';
import { useVerticalSwipeDismiss } from '@/lib/use_vertical_swipe_dismiss';

function PlayPauseIcon({ playing }: { playing: boolean }) {
  if (playing) {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <line x1="5.5" y1="4" x2="5.5" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <line x1="10.5" y1="4" x2="10.5" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M6 4.5L12 8L6 11.5V4.5Z" fill="currentColor" />
    </svg>
  );
}

export function ReaderAudioMiniBar({
  visible,
  collapsed,
  state,
  title,
  currentSec,
  durationSec,
  formatTime,
  chromeHidden,
  onToggle,
  onSeek,
  onExpand,
  onMinimize,
  onDismiss,
  onOpenSettings,
  onRetry,
}: {
  visible: boolean;
  collapsed: boolean;
  state: ReaderAudioState;
  currentSec: number;
  durationSec: number;
  formatTime: (n: number) => string;
  chromeHidden: boolean;
  onToggle: () => void;
  onSeek: (sec: number) => void;
  onExpand: () => void;
  onMinimize: () => void;
  onDismiss: () => void;
  onOpenSettings: () => void;
  onRetry?: () => void;
  title: string;
}) {
  const swipe = useVerticalSwipeDismiss({
    onDismiss,
    onExpand,
  });

  if (!visible) return null;

  const loading = state === 'loading';
  const errored = state === 'error';
  const pct = durationSec > 0 ? Math.min(100, (currentSec / durationSec) * 100) : 0;
  const playing = state === 'playing';

  if (collapsed && !errored) {
    return (
      <div
        className={[
          'reader-audio-mini',
          'is-collapsed',
          chromeHidden ? 'is-immersive' : '',
        ].join(' ')}
        role="region"
        aria-label="本章朗读控制"
      >
        <div className="reader-audio-mini-progress" style={{ width: `${pct}%` }} />
      </div>
    );
  }

  return (
    <div
      className={[
        'reader-audio-mini',
        chromeHidden ? 'is-immersive' : '',
        loading ? 'is-loading' : '',
        errored ? 'is-error' : '',
      ].join(' ')}
      role="region"
      aria-label="本章朗读控制"
      style={
        swipe.dragOffset > 0
          ? { transform: `translateY(${swipe.dragOffset}px)`, transition: 'none' }
          : undefined
      }
      onPointerDown={(e) => e.stopPropagation()}
      onTouchStart={swipe.onTouchStart}
      onTouchMove={swipe.onTouchMove}
      onTouchEnd={swipe.onTouchEnd}
      onTouchCancel={swipe.onTouchCancel}
    >
      <div className="half-sheet-grab reader-audio-mini-grab" aria-hidden />
      <div className="reader-audio-mini-track">
        {loading ? (
          <div className="reader-audio-mini-shimmer" aria-hidden />
        ) : (
          <input
            type="range"
            className="reader-audio-mini-range"
            min={0}
            max={durationSec || 1}
            step={0.5}
            value={Math.min(currentSec, durationSec || currentSec)}
            onChange={(e) => onSeek(Number(e.target.value))}
            aria-label="朗读进度"
            disabled={errored}
          />
        )}
        <span className="reader-audio-mini-time">
          {loading
            ? '加载中…'
            : errored
              ? '加载失败'
              : `${formatTime(currentSec)} / ${formatTime(durationSec)}`}
        </span>
      </div>
      <div className="reader-audio-mini-row">
        {errored ? (
          <>
            <button type="button" className="reader-audio-mini-retry" onClick={onRetry}>
              重试
            </button>
            <span className="reader-audio-mini-title reader-audio-mini-title-static">{title}</span>
            <button type="button" className="reader-audio-mini-expand" onClick={onDismiss} aria-label="关闭">
              ×
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="reader-audio-mini-play"
              onClick={onToggle}
              disabled={loading}
              aria-label={playing ? '暂停' : '播放'}
            >
              <PlayPauseIcon playing={playing} />
            </button>
            <button
              type="button"
              className="reader-audio-mini-title"
              onContextMenu={(e) => {
                e.preventDefault();
                onOpenSettings();
              }}
            >
              {title}
            </button>
            <button
              type="button"
              className="reader-audio-mini-minimize"
              onClick={onMinimize}
              aria-label="最小化朗读"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                <path
                  d="M4 5.5L7 8.5L10 5.5"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button type="button" className="reader-audio-mini-expand" onClick={onExpand} aria-label="展开专注朗读">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                <path d="M4 9L7 6L10 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
