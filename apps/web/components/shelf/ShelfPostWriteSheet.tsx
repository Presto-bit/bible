'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import AppBodyPortal from '@/components/AppBodyPortal';
import { useKeyboardInset } from '@/components/reader/useKeyboardInset';
import {
  getShelfDefaultVisibility,
  rememberShelfVisibility,
  shelfVisibilityHint,
  shelfVisibilityLabel,
  type ShelfPostVisibility,
} from '@/lib/shelf_posts';
import ShelfInlineComposer from '@/components/shelf/ShelfInlineComposer';

const VIS_OPTIONS: ShelfPostVisibility[] = ['public', 'friends', 'private'];

function VisibilityIcon({ visibility, size = 20 }: { visibility: ShelfPostVisibility; size?: number }) {
  if (visibility === 'public') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
      </svg>
    );
  }
  if (visibility === 'friends') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <path d="M16 11a3 3 0 1 0-2.83-4H11a4 4 0 1 0 0 8h2.17A3 3 0 0 0 16 11z" />
        <path d="M7 13a3 3 0 1 0 0 6h10a3 3 0 0 0 0-6" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export default function ShelfPostWriteSheet({
  title,
  contextLabel,
  contextBody,
  placeholder,
  kind,
  initialBody = '',
  initialVisibility,
  showReadStatus = false,
  onSave,
  onClose,
}: {
  title: string;
  contextLabel: string;
  contextBody?: string;
  placeholder: string;
  kind: 'review' | 'note';
  initialBody?: string;
  initialVisibility?: ShelfPostVisibility;
  showReadStatus?: boolean;
  onSave: (body: string, visibility: ShelfPostVisibility, readStatus?: 'reading' | 'finished') => void;
  onClose: () => void;
}) {
  const [body, setBody] = useState(initialBody);
  const [visibility, setVisibility] = useState<ShelfPostVisibility>(
    initialVisibility ?? getShelfDefaultVisibility(),
  );
  const [readStatus, setReadStatus] = useState<'reading' | 'finished'>('reading');
  const [contextExpanded, setContextExpanded] = useState(false);
  const [visOpen, setVisOpen] = useState(false);
  const { inset: kbInset, viewportHeight } = useKeyboardInset();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const keyboardUp = kbInset > 0;
  const contextCollapsed = keyboardUp && !contextExpanded;
  const sheetMaxHeight = viewportHeight
    ? `${Math.max(320, viewportHeight - 8)}px`
    : '92dvh';

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => textareaRef.current?.focus(), 120);
    return () => window.clearTimeout(t);
  }, []);

  const handleConfirm = useCallback(() => {
    const trimmed = body.trim();
    if (!trimmed) return;
    rememberShelfVisibility(visibility);
    onSave(trimmed, visibility, kind === 'review' ? readStatus : undefined);
    onClose();
  }, [body, visibility, readStatus, kind, onSave, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
      e.preventDefault();
      handleConfirm();
    },
    [handleConfirm],
  );

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const sheet = (
    <div
      className="sheet-backdrop thought-write-backdrop thought-write-backdrop-tall"
      data-dismiss-on-tab-nav
      onClick={onClose}
      onTouchMove={(e) => e.stopPropagation()}
      style={{ paddingBottom: kbInset }}
    >
      <div
        className={`sheet card thought-write-sheet thought-write-sheet-expanded${keyboardUp ? ' thought-write-sheet-keyboard' : ''}`}
        onClick={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
        style={{ maxHeight: sheetMaxHeight }}
      >
        <div className="thought-write-topbar">
          <button type="button" className="thought-write-back" onClick={onClose}>
            关闭
          </button>
          <strong className="thought-write-title">{title}</strong>
            <div className="thought-write-topbar-actions">
            <div className="thought-vis-picker-wrap">
              <button
                type="button"
                className="thought-vis-picker-btn"
                aria-label={`可见范围：${shelfVisibilityLabel(visibility)}`}
                onClick={() => setVisOpen((v) => !v)}
              >
                <VisibilityIcon visibility={visibility} />
              </button>
              {visOpen && (
                <div className="thought-vis-picker-menu" role="dialog" aria-label="选择可见范围">
                  {VIS_OPTIONS.map((v) => (
                    <button
                      key={v}
                      type="button"
                      className={`thought-vis-picker-item${visibility === v ? ' is-active' : ''}`}
                      onClick={() => {
                        setVisibility(v);
                        setVisOpen(false);
                      }}
                    >
                      <span className="thought-vis-picker-item-head">
                        <VisibilityIcon visibility={v} size={18} />
                        <strong>{shelfVisibilityLabel(v)}</strong>
                      </span>
                      <span className="thought-vis-picker-item-hint">{shelfVisibilityHint(v)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {kind !== 'note' ? (
              <button
                type="button"
                className="thought-write-save"
                disabled={!body.trim()}
                onClick={handleConfirm}
              >
                完成
              </button>
            ) : null}
          </div>
        </div>

        <div className="thought-write-scroll" onTouchMove={(e) => e.stopPropagation()}>
          <div className={`thought-verse-card thought-verse-card-compact${contextCollapsed ? ' is-collapsed' : ''}`}>
            <button
              type="button"
              className="thought-verse-collapse-btn"
              onClick={() => setContextExpanded((v) => !v)}
            >
              <span className="thought-verse-label">{kind === 'note' ? '所选摘录' : '关于'}</span>
              <strong className="thought-verse-ref">{contextLabel}</strong>
              {contextCollapsed && contextBody ? (
                <span className="thought-verse-collapsed-text">
                  {contextBody.slice(0, 28)}
                  {contextBody.length > 28 ? '…' : ''}
                </span>
              ) : contextBody ? (
                <p className="thought-verse-text">{contextBody}</p>
              ) : null}
            </button>
          </div>

          {showReadStatus ? (
            <div className="shelf-review-status-row" role="radiogroup" aria-label="阅读状态">
              <label className="shelf-review-status-opt">
                <input
                  type="radio"
                  name="read-status"
                  checked={readStatus === 'reading'}
                  onChange={() => setReadStatus('reading')}
                />
                在读
              </label>
              <label className="shelf-review-status-opt">
                <input
                  type="radio"
                  name="read-status"
                  checked={readStatus === 'finished'}
                  onChange={() => setReadStatus('finished')}
                />
                已读完
              </label>
            </div>
          ) : null}

          {kind === 'note' ? (
            <ShelfInlineComposer
              value={body}
              onChange={setBody}
              onSubmit={handleConfirm}
              placeholder={placeholder}
              submitLabel="发布"
              rows={4}
              className="shelf-inline-composer-sheet"
              inputRef={textareaRef}
            />
          ) : (
            <div className="thought-write-editor-wrap">
              <textarea
                ref={textareaRef}
                className="note-editor-input thought-write-input"
                rows={5}
                enterKeyHint="send"
                placeholder={placeholder}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (!mounted) return null;
  return <AppBodyPortal onTabAway={onClose}>{sheet}</AppBodyPortal>;
}
