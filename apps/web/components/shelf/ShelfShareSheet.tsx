'use client';

import { useState } from 'react';
import AppBodyPortal from '@/components/AppBodyPortal';
import ShelfCheckinSheet from '@/components/shelf/ShelfCheckinSheet';
import { shareShelfBook } from '@/lib/shelf_share';

type Props = {
  bookId: string;
  bookTitle: string;
  subtitle?: string;
  author?: string;
  onClose: () => void;
  onToast?: (msg: string) => void;
  onDone?: () => void;
};

/** 书籍分享半屏：系统分享 + 分享到群（对齐 AnalysisShareSheet）。 */
export default function ShelfShareSheet({
  bookId,
  bookTitle,
  subtitle = '',
  author = '',
  onClose,
  onToast,
  onDone,
}: Props) {
  const [groupOpen, setGroupOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const shareExternal = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const result = await shareShelfBook({
        bookId,
        title: bookTitle,
        subtitle,
        author,
      });
      if (result === 'cancelled') return;
      if (result === 'failed') {
        setErr('分享失败');
        return;
      }
      onToast?.(result === 'copied' ? '已复制链接与摘要' : '已调起分享');
      onDone?.();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (groupOpen) {
    return (
      <ShelfCheckinSheet
        bookId={bookId}
        bookTitle={bookTitle}
        onClose={() => {
          setGroupOpen(false);
          onClose();
        }}
        onDone={onDone}
      />
    );
  }

  return (
    <AppBodyPortal>
      <div className="sheet-backdrop" onClick={onClose}>
        <div
          className="sheet card daily-verse-share-sheet"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-label="分享书籍"
        >
          <div className="half-sheet-grab" aria-hidden />
          <div className="section-row group-settings-sheet-head">
            <button type="button" className="text-link" onClick={onClose}>
              关闭
            </button>
            <strong>分享书籍</strong>
            <span style={{ width: 36 }} aria-hidden />
          </div>
          <p className="muted daily-verse-share-preview">《{bookTitle}》</p>
          {(author || subtitle) ? (
            <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              {[author, subtitle].filter(Boolean).join(' · ')}
            </p>
          ) : null}
          <div className="daily-verse-share-actions">
            <button
              type="button"
              className="btn btn-block"
              disabled={busy}
              onClick={() => void shareExternal()}
            >
              {busy ? '准备中…' : '系统分享'}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-block"
              disabled={busy}
              onClick={() => setGroupOpen(true)}
            >
              分享到群
            </button>
          </div>
          {err ? (
            <p className="muted" role="alert" style={{ marginTop: 8 }}>
              {err}
            </p>
          ) : null}
        </div>
      </div>
    </AppBodyPortal>
  );
}
