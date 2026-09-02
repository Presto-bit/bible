'use client';

import { useEffect, useRef } from 'react';
import type { AudioTimestampVerse, ReaderAudioState } from '@/lib/reader_audio';

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
  onClose,
  onToggle,
  onSeek,
  onSeekToVerse,
  onOpenSettings,
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
  onClose: () => void;
  onToggle: () => void;
  onSeek: (delta: number) => void;
  onSeekToVerse: (sec: number) => void;
  onOpenSettings: () => void;
}) {
  const lyricsRef = useRef<HTMLDivElement | null>(null);
  const playing = state === 'playing';
  const pct = durationSec > 0 ? Math.min(100, (currentSec / durationSec) * 100) : 0;
  const hasLyrics = timestamps.length > 0 && verses.length > 0;

  useEffect(() => {
    if (!open || !hasLyrics || !currentVerse) return;
    const el = lyricsRef.current?.querySelector(`[data-verse="${currentVerse}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [open, currentVerse, hasLyrics]);

  if (!open) return null;

  return (
    <div className="reader-audio-focus-backdrop" onClick={onClose}>
      <div className="reader-audio-focus" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="reader-audio-focus-back" onClick={onClose}>
          回到阅读
        </button>
        <h2 className="reader-audio-focus-title">{title}</h2>
        <p className="reader-audio-focus-sub">{subtitle}</p>

        {hasLyrics ? (
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
          {formatTime(currentSec)} / {formatTime(durationSec)}
        </p>
        <button type="button" className="reader-audio-focus-main" onClick={onToggle} aria-label={playing ? '暂停' : '播放'}>
          {playing ? '‖' : '▶'}
        </button>
        <div className="reader-audio-focus-links">
          <button type="button" onClick={() => onSeek(-15)}>−15s</button>
          <button type="button" onClick={() => onSeek(15)}>+15s</button>
          <button type="button" onClick={onOpenSettings}>设置</button>
        </div>
      </div>
    </div>
  );
}
