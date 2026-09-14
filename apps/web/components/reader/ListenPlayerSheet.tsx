'use client';

import { useEffect, useRef, useState } from 'react';
import AppBodyPortal from '@/components/AppBodyPortal';
import type { BibleListenSettings, BibleListenUiState } from '@/hooks/useBibleListen';
import { useSheetOpenGuard } from '@/lib/use_sheet_open_guard';
import { SHEET_OPEN_GUARD_MS } from '@/lib/reader_gesture';
import { useVerticalSwipeDismiss } from '@/lib/use_vertical_swipe_dismiss';

const SLEEP_OPTIONS: { label: string; minutes: number | null }[] = [
  { label: '关', minutes: null },
  { label: '15 分', minutes: 15 },
  { label: '30 分', minutes: 30 },
  { label: '60 分', minutes: 60 },
];

export function ListenPlayerSheet({
  open,
  title,
  translationLabel,
  ui,
  error,
  verseText,
  currentSec,
  durationSec,
  formatTime,
  settings,
  speeds,
  canSeek,
  onClose,
  onToggle,
  onSeekMs,
  onStepVerse,
  onUpdateSettings,
  onArmSleep,
}: {
  open: boolean;
  title: string;
  translationLabel: string;
  ui: BibleListenUiState;
  error: string | null;
  verseText: string;
  currentSec: number;
  durationSec: number;
  formatTime: (n: number) => string;
  settings: BibleListenSettings;
  speeds: readonly number[];
  canSeek: boolean;
  onClose: () => void;
  onToggle: () => void;
  onSeekMs: (ms: number) => void;
  onStepVerse: (dir: -1 | 1) => void;
  onUpdateSettings: (patch: Partial<BibleListenSettings>) => void;
  onArmSleep: (minutes: number | null) => void;
}) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const { guardedClose } = useSheetOpenGuard(SHEET_OPEN_GUARD_MS);
  const swipe = useVerticalSwipeDismiss({
    onDismiss: onClose,
    scrollRef: bodyRef,
    dismissFromHeaderOnly: false,
    headerRef,
  });
  const [panel, setPanel] = useState<'none' | 'speed' | 'sleep'>('none');

  useEffect(() => {
    if (!open) setPanel('none');
  }, [open]);

  if (!open) return null;

  const preparing = ui === 'preparing';
  const playing = ui === 'playing';
  const errored = ui === 'error';
  const pct = durationSec > 0 ? Math.min(100, (currentSec / durationSec) * 100) : 0;
  const dragY = swipe.dragOffset > 0 ? swipe.dragOffset : 0;
  const dragStyle = dragY
    ? { transform: `translateY(${dragY}px)`, transition: 'none' as const }
    : undefined;

  return (
    <AppBodyPortal onTabAway={onClose}>
      <div
        className="listen-sheet-backdrop"
        onClick={() => guardedClose(onClose)}
      >
        <div
          className={[
            'listen-sheet',
            preparing ? 'is-preparing' : '',
            errored ? 'is-error' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          style={dragStyle}
          onClick={(e) => e.stopPropagation()}
          onTouchStart={swipe.onTouchStart}
          onTouchMove={swipe.onTouchMove}
          onTouchEnd={swipe.onTouchEnd}
        >
          <div ref={headerRef} className="listen-sheet-head">
            <div className="listen-sheet-grab" aria-hidden />
            <p className="listen-sheet-hint">下滑可继续听</p>
            <h2 className="listen-sheet-title">{title}</h2>
            <p className="listen-sheet-sub">{translationLabel}</p>
          </div>

          <div ref={bodyRef} className="listen-sheet-body">
            <p className="listen-sheet-verse">
              {preparing && !verseText ? '正在准备听读…' : verseText || ' '}
            </p>
          </div>

          <div className="listen-sheet-progress">
            <input
              type="range"
              className="listen-sheet-range"
              min={0}
              max={Math.max(1, durationSec)}
              step={0.1}
              value={Math.min(currentSec, durationSec || 0)}
              disabled={!canSeek || preparing}
              aria-label="听读进度"
              onChange={(e) => {
                if (!canSeek) return;
                onSeekMs(Number(e.target.value) * 1000);
              }}
            />
            <div className="listen-sheet-time">
              <span>{formatTime(currentSec)}</span>
              <span style={{ width: `${pct}%` }} className="listen-sheet-time-fill" aria-hidden />
              <span>{formatTime(durationSec)}</span>
            </div>
          </div>

          <div className="listen-sheet-controls">
            <button
              type="button"
              className="listen-sheet-ctl"
              disabled={preparing}
              aria-label="上一节"
              onClick={() => onStepVerse(-1)}
            >
              ‹‹
            </button>
            <button
              type="button"
              className={[
                'listen-sheet-play',
                preparing ? 'is-preparing' : '',
                playing ? 'is-playing' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              disabled={preparing}
              aria-label={
                preparing
                  ? '正在准备'
                  : playing
                    ? '暂停'
                    : errored
                      ? '重试'
                      : '播放'
              }
              onClick={onToggle}
            >
              {preparing ? (
                <span className="listen-sheet-spinner" aria-hidden />
              ) : playing ? (
                <span aria-hidden>‖</span>
              ) : (
                <span aria-hidden>▶</span>
              )}
            </button>
            <button
              type="button"
              className="listen-sheet-ctl"
              disabled={preparing}
              aria-label="下一节"
              onClick={() => onStepVerse(1)}
            >
              ››
            </button>
          </div>

          {preparing ? (
            <p className="listen-sheet-status" role="status">
              正在准备
            </p>
          ) : errored ? (
            <p className="listen-sheet-status is-error" role="alert">
              {error || '准备失败，点按重试'}
            </p>
          ) : (
            <p className="listen-sheet-status" aria-hidden>
              {' '}
            </p>
          )}

          <div className="listen-sheet-tools">
            <button
              type="button"
              className={panel === 'speed' ? 'is-on' : ''}
              onClick={() => setPanel((p) => (p === 'speed' ? 'none' : 'speed'))}
            >
              语速 {settings.speed}×
            </button>
            <button type="button" disabled title="P0 仅沉稳男声">
              沉稳男声
            </button>
            <button
              type="button"
              className={panel === 'sleep' ? 'is-on' : ''}
              onClick={() => setPanel((p) => (p === 'sleep' ? 'none' : 'sleep'))}
            >
              定时
              {settings.sleepMinutes ? ` ${settings.sleepMinutes}′` : ''}
            </button>
            <button
              type="button"
              className={settings.continuousChapter ? 'is-on' : ''}
              onClick={() =>
                onUpdateSettings({ continuousChapter: !settings.continuousChapter })
              }
            >
              续听{settings.continuousChapter ? '开' : '关'}
            </button>
          </div>

          {panel === 'speed' ? (
            <div className="listen-sheet-panel" role="group" aria-label="语速">
              {speeds.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={settings.speed === s ? 'is-on' : ''}
                  onClick={() => {
                    onUpdateSettings({ speed: s });
                    setPanel('none');
                  }}
                >
                  {s}×
                </button>
              ))}
            </div>
          ) : null}
          {panel === 'sleep' ? (
            <div className="listen-sheet-panel" role="group" aria-label="定时关闭">
              {SLEEP_OPTIONS.map((o) => (
                <button
                  key={o.label}
                  type="button"
                  className={settings.sleepMinutes === o.minutes ? 'is-on' : ''}
                  onClick={() => {
                    onArmSleep(o.minutes);
                    setPanel('none');
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </AppBodyPortal>
  );
}
