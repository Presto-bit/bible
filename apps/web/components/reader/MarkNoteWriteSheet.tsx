'use client';

import { SheetCloseButton } from '@/components/PageBackBar';
import { useEffect, useRef, useState } from 'react';
import { refToChineseLabel } from '@/lib/ref_label';
import { useKeyboardInset } from '@/components/reader/useKeyboardInset';

export default function MarkNoteWriteSheet({
  refLabel,
  verseText,
  onSave,
  onClose,
}: {
  refLabel: string;
  verseText?: string;
  onSave: (body: string) => void;
  onClose: () => void;
}) {
  const [body, setBody] = useState('');
  const { inset: kbInset, viewportHeight } = useKeyboardInset();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const cnRef = refToChineseLabel(refLabel) ?? refLabel;
  const sheetMaxHeight = viewportHeight
    ? `${Math.max(240, viewportHeight - 8)}px`
    : undefined;

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
      inputRef.current?.blur();
    };
  }, []);

  return (
    <div
      className="sheet-backdrop thought-write-backdrop"
      onClick={onClose}
      style={{ paddingBottom: kbInset }}
    >
      <div
        className="sheet card thought-write-sheet"
        onClick={(e) => e.stopPropagation()}
        style={sheetMaxHeight ? { maxHeight: sheetMaxHeight } : undefined}
      >
        <div className="half-sheet-grab" aria-hidden />
        <div className="section-row" style={{ marginTop: 0 }}>
          <strong>写笔记</strong>
          <SheetCloseButton onClick={onClose} />
        </div>

        <div className="thought-write-scroll">
          <div className="thought-verse-card">
            <span className="thought-verse-label">所选经文</span>
            <strong className="thought-verse-ref">{cnRef}</strong>
            {verseText ? (
              <p className="thought-verse-text">{verseText}</p>
            ) : (
              <p className="muted thought-verse-text">（未选中具体经文内容）</p>
            )}
          </div>

          <p className="muted" style={{ fontSize: 12, margin: '10px 0' }}>
            笔记仅保存在本机，可随时在经文旁查看
          </p>
          <textarea
            ref={inputRef}
            className="note-editor-input"
            rows={4}
            autoFocus
            enterKeyHint="done"
            placeholder="记录领受、疑问或祷告…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>

        <div className="thought-write-actions">
          <button
            type="button"
            className="btn"
            style={{ width: '100%', marginTop: 0 }}
            disabled={!body.trim()}
            onClick={() => {
              const t = body.trim();
              if (!t) return;
              inputRef.current?.blur();
              onSave(t);
            }}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
