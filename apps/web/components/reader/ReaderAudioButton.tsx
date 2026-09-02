'use client';

import type { ReaderAudioState } from '@/lib/reader_audio';

export function ReaderAudioWaveform({
  state,
  className = '',
}: {
  state: ReaderAudioState | 'unavailable';
  className?: string;
}) {
  const playing = state === 'playing';
  const unavailable = state === 'unavailable';
  const paused = state === 'paused';
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden
      className={[
        'reader-audio-wave',
        playing ? 'is-playing' : '',
        paused ? 'is-paused' : '',
        unavailable ? 'is-unavailable' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {unavailable ? (
        <line x1="1" y1="11" x2="11" y2="1" stroke="currentColor" strokeWidth="1.2" />
      ) : paused ? (
        <>
          <line x1="3.5" y1="4" x2="3.5" y2="8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <line x1="8.5" y1="4" x2="8.5" y2="8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </>
      ) : (
        <>
          <line className="reader-audio-wave-bar" x1="2" y1="10" x2="2" y2="6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <line className="reader-audio-wave-bar" x1="6" y1="10" x2="6" y2="3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <line className="reader-audio-wave-bar" x1="10" y1="10" x2="10" y2="5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

export function ReaderAudioButton({
  state,
  unavailable,
  onTap,
  onLongPress,
}: {
  state: ReaderAudioState;
  unavailable: boolean;
  onTap: () => void;
  onLongPress: () => void;
}) {
  const uiState = unavailable ? 'unavailable' : state === 'playing' ? 'playing' : state === 'paused' ? 'paused' : 'idle';
  const label =
    unavailable
      ? '本章朗读，此译本不可用'
      : state === 'playing'
        ? '本章朗读，播放中'
        : state === 'paused'
          ? '本章朗读，已暂停'
          : state === 'loading'
            ? '本章朗读，加载中'
            : '本章朗读，未播放';

  let longPressTimer: ReturnType<typeof setTimeout> | null = null;

  return (
    <button
      type="button"
      className={[
        'reader-audio-btn',
        state === 'playing' ? 'is-playing' : '',
        unavailable ? 'is-unavailable' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={label}
      aria-pressed={state === 'playing'}
      onClick={(e) => {
        e.stopPropagation();
        onTap();
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        longPressTimer = setTimeout(() => {
          longPressTimer = null;
          onLongPress();
        }, 480);
      }}
      onPointerUp={() => {
        if (longPressTimer) clearTimeout(longPressTimer);
      }}
      onPointerLeave={() => {
        if (longPressTimer) clearTimeout(longPressTimer);
      }}
    >
      <ReaderAudioWaveform state={uiState} />
      <span className="reader-audio-btn-label">朗读</span>
    </button>
  );
}
