'use client';

import { useState } from 'react';
import { SheetCloseButton } from '@/components/PageBackBar';
import AppBodyPortal from '@/components/AppBodyPortal';
import { BRAND_NAME } from '@/lib/brand';
import {
  shareVerseCard,
  wallpaperIndexCount,
  wallpaperPreviewUrl,
} from '@/lib/verse_card_share';

const WALLPAPER_PREF_KEY = 'presto_verse_card_wallpaper_v1';
const QUOTE_SOFT_MAX = 160;

type Props = {
  refLabel: string;
  text: string;
  versionLabel?: string;
  onClose: () => void;
  onDone?: (msg: string) => void;
};

function readSavedWallpaperIndex(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = localStorage.getItem(WALLPAPER_PREF_KEY);
    const n = raw == null ? NaN : Number(raw);
    if (!Number.isFinite(n)) return Math.floor(Math.random() * wallpaperIndexCount());
    return ((Math.floor(n) % wallpaperIndexCount()) + wallpaperIndexCount())
      % wallpaperIndexCount();
  } catch {
    return 0;
  }
}

/** 海报只归因单一译本（对照态的「A · B」取主栏） */
function primaryVersionLabel(label?: string): string | undefined {
  const t = (label || '').trim();
  if (!t) return undefined;
  return t.split(/[·•|/]/)[0]?.trim() || t;
}

function prepareQuote(raw: string): { quote: string; truncated: boolean } {
  const text = raw.trim();
  if (text.length <= QUOTE_SOFT_MAX) return { quote: text, truncated: false };
  return {
    quote: `${text.slice(0, QUOTE_SOFT_MAX - 1)}…`,
    truncated: true,
  };
}

export default function VerseCardSheet({
  refLabel,
  text,
  versionLabel,
  onClose,
  onDone,
}: Props) {
  const [wallpaperIndex, setWallpaperIndex] = useState(readSavedWallpaperIndex);
  const [note, setNote] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const preview = wallpaperPreviewUrl(wallpaperIndex);
  const { quote, truncated } = prepareQuote(text);
  const posterVersion = primaryVersionLabel(versionLabel);
  const wallpaperCount = wallpaperIndexCount();

  const pickWallpaper = (i: number) => {
    setWallpaperIndex(i);
    try {
      localStorage.setItem(WALLPAPER_PREF_KEY, String(i));
    } catch {
      /* ignore */
    }
  };

  const onShare = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await shareVerseCard({
        refLabel,
        text: quote,
        wallpaperIndex,
        note: note.trim().slice(0, 40),
        versionLabel: posterVersion,
      });
      if (result === 'shared' || result === 'downloaded') {
        onDone?.(result === 'shared' ? '已分享金句卡' : '已保存金句卡');
        onClose();
      } else if (result === 'failed') {
        onDone?.('生成失败，请重试');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppBodyPortal>
      <div className="sheet-backdrop" onClick={onClose}>
        <div
          className="sheet card verse-card-sheet"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="section-row" style={{ marginTop: 0 }}>
            <strong>金句卡</strong>
            <SheetCloseButton onClick={onClose} />
          </div>

          <div
            className="verse-card-preview verse-card-preview-poster"
            style={{ backgroundImage: `url(${preview})` }}
            aria-label="金句卡预览"
          >
            <div className="verse-card-preview-scrim">
              <div className="verse-card-preview-brand">
                <span className="verse-card-preview-brand-name">{BRAND_NAME}</span>
                <span className="verse-card-preview-brand-sub">金句</span>
              </div>
              <div className="verse-card-preview-body">
                <p className="verse-card-preview-ref">{refLabel}</p>
                <p className="verse-card-preview-quote">{quote || '经文加载中'}</p>
                {note.trim() ? (
                  <p className="verse-card-preview-note">{note.trim()}</p>
                ) : null}
                {posterVersion ? (
                  <p className="verse-card-preview-version">{posterVersion}</p>
                ) : null}
              </div>
            </div>
          </div>

          {truncated ? (
            <p className="muted verse-card-truncate-hint">
              经文较长，海报将展示前 {QUOTE_SOFT_MAX} 字
            </p>
          ) : null}

          <div className="verse-card-wallpaper-strip" role="listbox" aria-label="选择风景">
            {Array.from({ length: wallpaperCount }, (_, i) => (
              <button
                key={i}
                type="button"
                role="option"
                aria-selected={i === wallpaperIndex}
                className={`verse-card-wallpaper-thumb${i === wallpaperIndex ? ' is-active' : ''}`}
                style={{ backgroundImage: `url(${wallpaperPreviewUrl(i)})` }}
                onClick={() => pickWallpaper(i)}
              />
            ))}
          </div>

          {noteOpen ? (
            <label className="verse-card-note-label">
              <span className="muted" style={{ fontSize: 12 }}>附一句想法（可选，≤40 字）</span>
              <input
                className="verse-card-note-input"
                value={note}
                maxLength={40}
                placeholder="今天这句话提醒我…"
                onChange={(e) => setNote(e.target.value)}
                autoFocus
              />
            </label>
          ) : (
            <button
              type="button"
              className="text-link verse-card-note-toggle"
              onClick={() => setNoteOpen(true)}
            >
              加一句想法（可选）
            </button>
          )}

          <button
            type="button"
            className="btn"
            style={{ width: '100%', marginTop: 12 }}
            disabled={busy || !quote}
            onClick={() => void onShare()}
          >
            {busy ? '生成中…' : '生成并分享'}
          </button>
        </div>
      </div>
    </AppBodyPortal>
  );
}
