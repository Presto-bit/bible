'use client';

import { useState } from 'react';
import { SheetCloseButton } from '@/components/PageBackBar';
import AppBodyPortal from '@/components/AppBodyPortal';
import {
  shareVerseCard,
  wallpaperIndexCount,
  wallpaperPreviewUrl,
} from '@/lib/verse_card_share';

type Props = {
  refLabel: string;
  text: string;
  versionLabel?: string;
  onClose: () => void;
  onDone?: (msg: string) => void;
};

export default function VerseCardSheet({
  refLabel,
  text,
  versionLabel,
  onClose,
  onDone,
}: Props) {
  const [wallpaperIndex, setWallpaperIndex] = useState(
    () => Math.floor(Math.random() * wallpaperIndexCount()),
  );
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const preview = wallpaperPreviewUrl(wallpaperIndex);
  const quote = text.trim().length > 120 ? `${text.trim().slice(0, 118)}…` : text.trim();

  const nextWallpaper = (delta: number) => {
    const n = wallpaperIndexCount();
    setWallpaperIndex((i) => (i + delta + n) % n);
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
        versionLabel,
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
            className="verse-card-preview"
            style={{ backgroundImage: `url(${preview})` }}
          >
            <div className="verse-card-preview-scrim">
              <p className="verse-card-preview-ref">{refLabel}</p>
              <p className="verse-card-preview-quote">{quote || '（无经文）'}</p>
              {note.trim() ? (
                <p className="verse-card-preview-note">{note.trim()}</p>
              ) : null}
            </div>
          </div>
          <div className="verse-card-wallpaper-row">
            <button type="button" className="font-pill" onClick={() => nextWallpaper(-1)}>
              上一张风景
            </button>
            <button type="button" className="font-pill" onClick={() => nextWallpaper(1)}>
              下一张风景
            </button>
          </div>
          <label className="verse-card-note-label">
            <span className="muted" style={{ fontSize: 12 }}>附一句想法（可选，≤40 字）</span>
            <input
              className="verse-card-note-input"
              value={note}
              maxLength={40}
              placeholder="今天这句话提醒我…"
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
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
