'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { refToChineseLabel } from '@/lib/ref_label';
import {
  clearThoughtDraft,
  getDefaultVisibility,
  loadThoughtDraft,
  rememberVisibility,
  saveThoughtDraft,
  visibilityHint,
  visibilityLabel,
  type ThoughtVisibility,
} from '@/lib/reader_thoughts';
import { useKeyboardInset } from '@/components/reader/useKeyboardInset';

const VIS_OPTIONS: ThoughtVisibility[] = ['public', 'friends', 'private'];

function VisibilityIcon({ visibility, size = 20 }: { visibility: ThoughtVisibility; size?: number }) {
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

export default function ThoughtWriteSheet({
  refStr,
  refLabel,
  verseText,
  mode,
  initialBody = '',
  initialVisibility,
  onSave,
  onClose,
  onBack,
}: {
  refStr: string;
  refLabel: string;
  verseText?: string;
  mode: 'new' | 'edit';
  initialBody?: string;
  initialVisibility?: ThoughtVisibility;
  onSave: (body: string, visibility: ThoughtVisibility) => void;
  onClose: () => void;
  onBack?: () => void;
}) {
  const draft = mode === 'new' ? loadThoughtDraft(refStr) : null;
  const [body, setBody] = useState(draft?.body ?? initialBody);
  const [visibility, setVisibility] = useState<ThoughtVisibility>(
    draft?.visibility ?? initialVisibility ?? getDefaultVisibility(),
  );
  const [verseExpanded, setVerseExpanded] = useState(false);
  const [visOpen, setVisOpen] = useState(false);
  const { inset: kbInset, viewportHeight } = useKeyboardInset();
  const savedRef = useRef(false);
  const cnRef = refToChineseLabel(refLabel) ?? refLabel;
  const keyboardUp = kbInset > 0;
  const verseCollapsed = keyboardUp && !verseExpanded;
  const sheetMaxHeight = viewportHeight
    ? `${Math.max(360, viewportHeight - 8)}px`
    : '92dvh';

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    if (savedRef.current || mode === 'edit') return;
    saveThoughtDraft(refStr, body, visibility);
  }, [body, visibility, refStr, mode]);

  const persistIfNeeded = useCallback(() => {
    const trimmed = body.trim();
    if (!trimmed) {
      if (mode === 'new') clearThoughtDraft(refStr);
      return false;
    }
    savedRef.current = true;
    rememberVisibility(visibility);
    clearThoughtDraft(refStr);
    onSave(trimmed, visibility);
    return true;
  }, [body, visibility, refStr, mode, onSave]);

  const handleBack = useCallback(() => {
    persistIfNeeded();
    if (onBack) onBack();
    else onClose();
  }, [persistIfNeeded, onBack, onClose]);

  const handleBackdropClose = useCallback(() => {
    persistIfNeeded();
    onClose();
  }, [persistIfNeeded, onClose]);

  return (
    <div
      className="sheet-backdrop thought-write-backdrop thought-write-backdrop-tall"
      onClick={handleBackdropClose}
      style={{ paddingBottom: kbInset }}
    >
      <div
        className="sheet card thought-write-sheet thought-write-sheet-expanded"
        onClick={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
        style={{ maxHeight: sheetMaxHeight }}
      >
        <div className="thought-write-topbar">
          <button
            type="button"
            className="thought-write-back"
            onClick={handleBack}
          >
            ‹ {onBack ? '返回' : '关闭'}
          </button>
          <strong className="thought-write-title">{mode === 'edit' ? '编辑想法' : '写想法'}</strong>
          <div className="thought-vis-picker-wrap">
            <button
              type="button"
              className="thought-vis-picker-btn"
              aria-label={`可见范围：${visibilityLabel(visibility)}`}
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
                      <strong>{visibilityLabel(v)}</strong>
                    </span>
                    <span className="thought-vis-picker-item-hint">{visibilityHint(v)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className={`thought-verse-card thought-verse-card-compact${verseCollapsed ? ' is-collapsed' : ''}`}>
          <button
            type="button"
            className="thought-verse-collapse-btn"
            onClick={() => setVerseExpanded((v) => !v)}
          >
            <span className="thought-verse-label">所选经文</span>
            <strong className="thought-verse-ref">{cnRef}</strong>
            {verseCollapsed ? (
              <span className="thought-verse-collapsed-text">
                {verseText ? `${verseText.slice(0, 28)}${verseText.length > 28 ? '…' : ''}` : '（未选中具体经文）'}
              </span>
            ) : verseText ? (
              <p className="thought-verse-text">{verseText}</p>
            ) : (
              <p className="muted thought-verse-text">（未选中具体经文内容）</p>
            )}
          </button>
        </div>

        <div className="thought-write-editor-wrap">
          <textarea
            className="note-editor-input thought-write-input"
            rows={5}
            enterKeyHint="done"
            placeholder="写下你的领受、疑问或祷告…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
