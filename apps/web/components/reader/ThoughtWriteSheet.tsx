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
  type ThoughtVisibility,
} from '@/lib/reader_thoughts';
import { useKeyboardInset } from '@/components/reader/useKeyboardInset';
import { useConfirm } from '@/components/ui/ConfirmProvider';

const VIS_OPTIONS: ThoughtVisibility[] = ['public', 'friends', 'private'];

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
  const confirm = useConfirm();
  const draft = mode === 'new' ? loadThoughtDraft(refStr) : null;
  const [body, setBody] = useState(draft?.body ?? initialBody);
  const [visibility, setVisibility] = useState<ThoughtVisibility>(
    draft?.visibility ?? initialVisibility ?? getDefaultVisibility(),
  );
  const [verseExpanded, setVerseExpanded] = useState(false);
  const { inset: kbInset, viewportHeight } = useKeyboardInset();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const savedRef = useRef(false);
  const cnRef = refToChineseLabel(refLabel) ?? refLabel;
  const keyboardUp = kbInset > 0;
  const verseCollapsed = keyboardUp && !verseExpanded;
  const sheetMaxHeight = viewportHeight
    ? `${Math.max(320, viewportHeight - 8)}px`
    : '88dvh';

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

  const requestClose = useCallback(async () => {
    const trimmed = body.trim();
    if (trimmed && trimmed !== initialBody.trim()) {
      const ok = await confirm({
        title: '放弃编辑？',
        message: '未保存的内容将保留为草稿，稍后可继续编辑。',
        confirmLabel: '离开',
        cancelLabel: '继续编辑',
      });
      if (!ok) return;
    } else if (mode === 'new') {
      clearThoughtDraft(refStr);
    }
    onClose();
  }, [body, initialBody, mode, refStr, confirm, onClose]);

  const handleSave = () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    savedRef.current = true;
    rememberVisibility(visibility);
    clearThoughtDraft(refStr);
    onSave(trimmed, visibility);
  };

  return (
    <div
      className="sheet-backdrop thought-write-backdrop thought-write-backdrop-tall"
      onClick={() => void requestClose()}
      style={{ paddingBottom: kbInset }}
    >
      <div
        className="sheet card thought-write-sheet thought-write-sheet-expanded"
        onClick={(e) => e.stopPropagation()}
        style={{ maxHeight: sheetMaxHeight }}
      >
        <div className="thought-write-topbar">
          <button
            type="button"
            className="thought-write-back"
            onClick={() => {
              if (onBack) onBack();
              else void requestClose();
            }}
          >
            ‹ {onBack ? '返回' : '关闭'}
          </button>
          <strong className="thought-write-title">{mode === 'edit' ? '编辑想法' : '写想法'}</strong>
          <button
            type="button"
            className="thought-write-save"
            disabled={!body.trim()}
            onClick={handleSave}
          >
            保存
          </button>
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

        <div className="thought-visibility-row" role="radiogroup" aria-label="可见范围">
          {VIS_OPTIONS.map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={visibility === v}
              className={`thought-visibility-pill${visibility === v ? ' is-active' : ''}`}
              onClick={() => setVisibility(v)}
            >
              {v === 'public' ? '公开' : v === 'friends' ? '共读' : '私密'}
            </button>
          ))}
        </div>
        <p className="thought-visibility-hint">{visibilityHint(visibility)}</p>

        <div className="thought-write-scroll thought-write-editor-wrap">
          <textarea
            ref={inputRef}
            className="note-editor-input thought-write-input"
            autoFocus
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
