'use client';

import { SheetCloseButton } from '@/components/PageBackBar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { effectiveId } from '@/lib/api';
import {
  isThoughtLiked,
  myThoughtsForRef,
  sortedThoughts,
  sortedThoughtsForVerse,
  toggleThoughtLike,
  visibilityLabel,
  type ThoughtRow,
} from '@/lib/reader_thoughts';
import { deleteThoughtAndClearMark } from '@/lib/thought_mark_cleanup';
import { useConfirm } from '@/components/ui/ConfirmProvider';

function timeLabel(ms: number) {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ThoughtHubSheet({
  refStr,
  refLabel,
  verseText,
  bookId,
  chapter,
  verse,
  onChanged,
  onClose,
  onWriteNew,
  onEdit,
}: {
  refStr: string;
  refLabel: string;
  verseText: string;
  bookId?: string;
  chapter?: number;
  verse?: number;
  onChanged?: () => void;
  onClose: () => void;
  onWriteNew: () => void;
  onEdit: (thought: ThoughtRow) => void;
}) {
  const confirm = useConfirm();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const loadThoughts = useCallback(() => {
    if (bookId != null && chapter != null && verse != null) {
      return sortedThoughtsForVerse(bookId, chapter, verse);
    }
    return sortedThoughts(refStr);
  }, [bookId, chapter, verse, refStr]);

  const [thoughts, setThoughts] = useState<ThoughtRow[]>(() => loadThoughts());
  const uid = effectiveId() || 'me';
  const mineCount = useMemo(
    () => myThoughtsForRef(refStr).length,
    [refStr, thoughts],
  );

  const refresh = useCallback(() => {
    setThoughts(loadThoughts());
    onChanged?.();
  }, [loadThoughts, onChanged]);

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: '删除想法',
      message: '确定删除这条想法？同节划线也会一并去掉。',
      confirmLabel: '删除',
      danger: true,
    });
    if (!ok) return;
    deleteThoughtAndClearMark(id);
    refresh();
  };

  const sheet = (
    <div className="sheet-backdrop thought-hub-backdrop" onClick={onClose} onTouchMove={(e) => e.stopPropagation()}>
      <div
        className={`sheet card thoughts-list-sheet thought-hub-sheet${thoughts.length > 0 ? ' thought-hub-sheet-tall' : ''}`}
        onClick={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
      >
        <div className="half-sheet-grab" aria-hidden />
        <div className="section-row" style={{ marginTop: 0 }}>
          <strong>本节想法</strong>
          <SheetCloseButton onClick={onClose} />
        </div>

        <div className="thought-verse-card thought-verse-card-compact">
          <p className="thought-verse-ref">{refLabel}</p>
          <p className="thought-verse-text">{verseText}</p>
        </div>

        <p className="thoughts-count">
          共 {thoughts.length} 条{mineCount > 0 ? ` · 你的 ${mineCount} 条` : ''}
        </p>

        <div className="thoughts-list-body thought-hub-list">
          {thoughts.length === 0 ? (
            <p className="muted thoughts-empty">还没有想法，来写第一条吧</p>
          ) : (
            thoughts.map((t) => {
              const liked = isThoughtLiked(t);
              const mine = t.authorId === uid;
              return (
                <div key={t.id} className="thought-item">
                  <div className="thought-item-head">
                    <strong>{t.authorName}{mine ? ' · 我' : ''}</strong>
                    <span className="muted">{timeLabel(t.createdAtMs)}</span>
                  </div>
                  <p className="thought-item-body">{t.body}</p>
                  <div className="thought-item-foot">
                    <div className="thought-item-actions">
                      <button
                        type="button"
                        className={`thought-like-btn ${liked ? 'thought-like-active' : ''}`}
                        onClick={() => {
                          toggleThoughtLike(t.id);
                          refresh();
                        }}
                      >
                        {liked ? '♥' : '♡'} {t.likesCount}
                      </button>
                      {mine && (
                        <>
                          <button type="button" className="text-link" onClick={() => onEdit(t)}>
                            编辑
                          </button>
                          <button
                            type="button"
                            className="text-link"
                            style={{ color: '#b1554a' }}
                            onClick={() => void handleDelete(t.id)}
                          >
                            删除
                          </button>
                        </>
                      )}
                    </div>
                    <span className={`thought-vis-badge thought-vis-${t.visibility}`}>
                      {visibilityLabel(t.visibility)}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="thought-hub-footer">
          <button type="button" className="btn thought-hub-new-btn" onClick={onWriteNew}>
            + 写一条想法
          </button>
        </div>
      </div>
    </div>
  );

  if (!mounted) return null;
  return createPortal(sheet, document.body);
}
