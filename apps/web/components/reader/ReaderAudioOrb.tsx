'use client';

import { useRef } from 'react';
import type { ReaderAudioState } from '@/lib/reader_audio';
import { useHorizontalSwipeAction } from '@/lib/use_horizontal_swipe_action';
import { useVerticalSwipeDismiss } from '@/lib/use_vertical_swipe_dismiss';

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
  onStop,
}: {
  visible: boolean;
  state: ReaderAudioState;
  currentSec: number;
  durationSec: number;
  immersive?: boolean;
  onToggle: () => void;
  onRestore: () => void;
  onStop: () => void;
}) {
  const gestureHandledRef = useRef(false);
  const restoreFromSwipe = () => {
    gestureHandledRef.current = true;
    onRestore();
  };
  const stopFromSwipe = () => {
    gestureHandledRef.current = true;
    onStop();
  };
  const horizontal = useHorizontalSwipeAction({
    onSwipeLeft: restoreFromSwipe,
    onSwipeRight: restoreFromSwipe,
  });
  const vertical = useVerticalSwipeDismiss({
    onDismiss: stopFromSwipe,
    dismissDy: 40,
  });

  if (!visible) return null;

  const loading = state === 'loading';
  const playing = state === 'playing';
  const pct = durationSec > 0 ? Math.min(1, currentSec / durationSec) : 0;
  const dashOffset = C * (1 - pct);

  return (
    <div
      className={[
        'reader-audio-orb-wrap',
        immersive ? 'is-immersive' : '',
      ].filter(Boolean).join(' ')}
    >
      <button
        type="button"
        className={[
          'reader-audio-orb',
          loading ? 'is-loading' : '',
          playing ? 'is-playing' : '',
        ].filter(Boolean).join(' ')}
        aria-label={playing ? '暂停朗读' : '继续朗读'}
        onTouchStart={(e) => {
          e.stopPropagation();
          gestureHandledRef.current = false;
          horizontal.onTouchStart(e);
          vertical.onTouchStart(e);
        }}
        onTouchMove={(e) => {
          horizontal.onTouchMove(e);
          vertical.onTouchMove(e);
        }}
        onTouchEnd={(e) => {
          horizontal.onTouchEnd(e);
          vertical.onTouchEnd(e);
        }}
        onTouchCancel={(e) => {
          horizontal.onTouchCancel(e);
          vertical.onTouchCancel(e);
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (gestureHandledRef.current) {
            gestureHandledRef.current = false;
            return;
          }
          onToggle();
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
      <button
        type="button"
        className="reader-audio-orb-close"
        aria-label="结束朗读"
        onClick={(e) => {
          e.stopPropagation();
          onStop();
        }}
      >
        ×
      </button>
    </div>
  );
}
