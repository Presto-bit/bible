'use client';

import { useEffect, useRef, useState } from 'react';
import AppBodyPortal from '@/components/AppBodyPortal';
import type { BibleBook } from '@/lib/api';
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

type LocTab = 'chapters' | 'books';

export function ListenPlayerSheet({
  open,
  title,
  translationLabel,
  ui,
  error,
  verses,
  currentVerse,
  currentSec,
  durationSec,
  formatTime,
  settings,
  speeds,
  canSeek,
  books,
  book,
  chapter,
  bookAbbr,
  canPrevChapter,
  canNextChapter,
  onClose,
  onToggle,
  onSeekMs,
  onSeekVerse,
  onPrevChapter,
  onNextChapter,
  onPickChapter,
  onUpdateSettings,
  onArmSleep,
}: {
  open: boolean;
  title: string;
  translationLabel: string;
  ui: BibleListenUiState;
  error: string | null;
  verses: { verse: number; text: string }[];
  currentVerse: number | null;
  currentSec: number;
  durationSec: number;
  formatTime: (n: number) => string;
  settings: BibleListenSettings;
  speeds: readonly number[];
  canSeek: boolean;
  books: BibleBook[];
  book: BibleBook;
  chapter: number;
  bookAbbr: (name: string) => string;
  canPrevChapter: boolean;
  canNextChapter: boolean;
  onClose: () => void;
  onToggle: () => void;
  onSeekMs: (ms: number) => void;
  onSeekVerse: (verse: number) => void;
  onPrevChapter: () => void;
  onNextChapter: () => void;
  onPickChapter: (book: BibleBook, chapter: number) => void;
  onUpdateSettings: (patch: Partial<BibleListenSettings>) => void;
  onArmSleep: (minutes: number | null) => void;
}) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const currentRowRef = useRef<HTMLButtonElement | null>(null);
  const { guardedClose } = useSheetOpenGuard(SHEET_OPEN_GUARD_MS);
  const swipe = useVerticalSwipeDismiss({
    onDismiss: onClose,
    scrollRef: bodyRef,
    dismissFromHeaderOnly: false,
    headerRef,
  });
  const [panel, setPanel] = useState<'none' | 'speed' | 'sleep'>('none');
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [locTab, setLocTab] = useState<LocTab>('chapters');
  const [selectedBookId, setSelectedBookId] = useState(book.id);

  useEffect(() => {
    if (!open) {
      setPanel('none');
      setCatalogOpen(false);
    }
  }, [open]);

  useEffect(() => {
    if (!catalogOpen) return;
    setLocTab('chapters');
    setSelectedBookId(book.id);
  }, [catalogOpen, book.id]);

  useEffect(() => {
    if (!open || currentVerse == null) return;
    const el = currentRowRef.current;
    if (!el) return;
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [open, currentVerse, chapter, book.id]);

  if (!open) return null;

  const preparing = ui === 'preparing';
  const playing = ui === 'playing';
  const errored = ui === 'error';
  const pct = durationSec > 0 ? Math.min(100, (currentSec / durationSec) * 100) : 0;
  const dragY = swipe.dragOffset > 0 ? swipe.dragOffset : 0;
  const dragStyle = dragY
    ? { transform: `translateY(${dragY}px)`, transition: 'none' as const }
    : undefined;

  const selectedBook = books.find((b) => b.id === selectedBookId) ?? book;
  const ot = books.filter((b) => b.testament.toUpperCase().startsWith('O'));
  const nt = books.filter((b) => !b.testament.toUpperCase().startsWith('O'));

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
            <button
              type="button"
              className="listen-sheet-title-btn"
              onClick={() => setCatalogOpen(true)}
              aria-label="选择书卷章节"
            >
              <h2 className="listen-sheet-title">{title}</h2>
              <span className="listen-sheet-title-caret" aria-hidden>
                ▾
              </span>
            </button>
            <p className="listen-sheet-sub">{translationLabel}</p>
          </div>

          <div ref={bodyRef} className="listen-sheet-body">
            {preparing && verses.length === 0 ? (
              <p className="listen-sheet-empty">正在准备听读…</p>
            ) : verses.length === 0 ? (
              <p className="listen-sheet-empty">暂无经文</p>
            ) : (
              <div className="listen-sheet-scripture">
                {verses.map((v) => {
                  const isCurrent = currentVerse === v.verse;
                  return (
                    <button
                      key={v.verse}
                      type="button"
                      ref={isCurrent ? currentRowRef : undefined}
                      className={`listen-sheet-verse-row${isCurrent ? ' is-current' : ''}`}
                      disabled={!canSeek || preparing}
                      onClick={() => {
                        if (!canSeek || preparing) return;
                        onSeekVerse(v.verse);
                      }}
                    >
                      <span className="listen-vn">{v.verse}</span>
                      <span>{v.text}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="listen-sheet-footer">
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
              disabled={preparing || !canPrevChapter}
              aria-label="上一章"
              onClick={onPrevChapter}
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
              disabled={preparing || !canNextChapter}
              aria-label="下一章"
              onClick={onNextChapter}
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

          {catalogOpen ? (
            <div className="listen-catalog" role="dialog" aria-label="选择经卷与章节">
              <div className="listen-catalog-head">
                <strong>{selectedBook.name}</strong>
                <button
                  type="button"
                  className="listen-catalog-close"
                  onClick={() => setCatalogOpen(false)}
                >
                  关闭
                </button>
              </div>
              <div className="seg-tabs reader-loc-seg-tabs">
                <button
                  type="button"
                  className={`seg-tab ${locTab === 'books' ? 'seg-tab-active' : ''}`}
                  onClick={() => setLocTab('books')}
                >
                  卷
                </button>
                <button
                  type="button"
                  className={`seg-tab ${locTab === 'chapters' ? 'seg-tab-active' : ''}`}
                  onClick={() => setLocTab('chapters')}
                >
                  章
                </button>
              </div>
              {locTab === 'chapters' ? (
                <div className="listen-catalog-chapters">
                  <div className="chapter-grid reader-loc-chapter-grid">
                    {Array.from({ length: selectedBook.chapter_count }, (_, i) => i + 1).map(
                      (n) => {
                        const isCurrent = selectedBook.id === book.id && chapter === n;
                        return (
                          <button
                            key={n}
                            type="button"
                            className={`chapter-cell${isCurrent ? ' chapter-cell-active' : ''}`}
                            onClick={() => {
                              onPickChapter(selectedBook, n);
                              setCatalogOpen(false);
                            }}
                          >
                            {n}
                          </button>
                        );
                      },
                    )}
                  </div>
                </div>
              ) : (
                <div className="listen-catalog-books">
                  {[
                    ['旧约', ot],
                    ['新约', nt],
                  ].map(([label, list]) =>
                    (list as BibleBook[]).length ? (
                      <div key={label as string} className="reader-loc-book-group">
                        <p className="reader-loc-book-label">{label as string}</p>
                        <div className="reader-loc-book-grid">
                          {(list as BibleBook[]).map((b) => (
                            <button
                              key={b.id}
                              type="button"
                              className={`reader-loc-book-cell${
                                selectedBookId === b.id ? ' is-active' : ''
                              }`}
                              onClick={() => {
                                setSelectedBookId(b.id);
                                setLocTab('chapters');
                              }}
                            >
                              {bookAbbr(b.name)}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null,
                  )}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </AppBodyPortal>
  );
}
