'use client';

import { useRef } from 'react';
import type { ReaderAudioState } from '@/lib/reader_audio';
import { useHorizontalSwipeAction } from '@/lib/use_horizontal_swipe_action';

const R = 20;
const C = 2 * Math.PI * R;

function PlayPauseGlyph({ playing, size = 14 }: { playing: boolean; size?: number }) {
  if (playing) {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
        <line x1="5.5" y1="4" x2="5.5" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <line x1="10.5" y1="4" x2="10.5" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M6 4.5L12 8L6 11.5V4.5Z" fill="currentColor" />
    </svg>
  );
}

export function ReaderAudioOrb({
  visible,
  state,
  currentSec,
  durationSec,
  immersive,
  onToggle,
  onRestore,
}: {
  visible: boolean;
  state: ReaderAudioState;
  currentSec: number;
  durationSec: number;
  immersive?: boolean;
  onToggle: () => void;
  onRestore: () => void;
}) {
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);
  const swipeHandledRef = useRef(false);
  const restoreFromSwipe = () => {
    swipeHandledRef.current = true;
    onRestore();
  };
  const horizontal = useHorizontalSwipeAction({
    onSwipeLeft: restoreFromSwipe,
    onSwipeRight: restoreFromSwipe,
  });

  if (!visible) return null;

  const loading = state === 'loading';
  const playing = state === 'playing';
  const pct = durationSec > 0 ? Math.min(1, currentSec / durationSec) : 0;
  const dashOffset = C * (1 - pct);

  const clearLongPress = () => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  };

  return (
    <button
      type="button"
      className={[
        'reader-audio-orb',
        immersive ? 'is-immersive' : '',
        loading ? 'is-loading' : '',
        playing ? 'is-playing' : '',
      ].filter(Boolean).join(' ')}
      aria-label={playing ? '暂停朗读' : '继续朗读'}
      onPointerDown={(e) => {
        e.stopPropagation();
        longPressTriggeredRef.current = false;
        clearLongPress();
        longPressRef.current = setTimeout(() => {
          longPressTriggeredRef.current = true;
          onRestore();
        }, 520);
      }}
      onTouchStart={(e) => {
        e.stopPropagation();
        swipeHandledRef.current = false;
        horizontal.onTouchStart(e);
      }}
      onTouchMove={(e) => {
        horizontal.onTouchMove(e);
      }}
      onTouchEnd={(e) => {
        horizontal.onTouchEnd(e);
      }}
      onTouchCancel={(e) => {
        horizontal.onTouchCancel(e);
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        clearLongPress();
        if (swipeHandledRef.current) {
          swipeHandledRef.current = false;
          return;
        }
        if (longPressTriggeredRef.current) return;
        onToggle();
      }}
      onPointerLeave={clearLongPress}
      onPointerCancel={clearLongPress}
      onContextMenu={(e) => {
        e.preventDefault();
        onRestore();
      }}
    >
      <svg className="reader-audio-orb-ring" width="48" height="48" viewBox="0 0 48 48" aria-hidden>
        <circle className="reader-audio-orb-track" cx="24" cy="24" r={R} />
        <circle
          className="reader-audio-orb-progress"
          cx="24"
          cy="24"
          r={R}
          strokeDasharray={C}
          strokeDashoffset={loading ? C * 0.25 : dashOffset}
          transform="rotate(-90 24 24)"
        />
      </svg>
      <span className="reader-audio-orb-icon">
        {loading ? <span className="reader-audio-orb-dot" aria-hidden /> : <PlayPauseGlyph playing={playing} />}
      </span>
    </button>
  );
}
