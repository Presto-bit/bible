'use client';

import { SheetCloseButton } from '@/components/PageBackBar';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export default function NoteEditorSheet({
  mode = 'new',
  initialTitle = '',
  initialBody = '',
  refLabel,
  onSave,
  onClose,
}: {
  mode?: 'new' | 'edit';
  initialTitle?: string;
  initialBody?: string;
  refLabel?: string;
  onSave: (payload: { title: string; body: string }) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [text, setText] = useState(initialBody);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const sheet = (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="half-sheet note-editor-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="half-sheet-head">
          <div className="half-sheet-grab" />
          <div className="half-sheet-title">
            <strong>
              {mode === 'edit' ? '编辑笔记' : '写笔记'}
              {refLabel ? ` · ${refLabel}` : ''}
            </strong>
            <SheetCloseButton onClick={onClose} />
          </div>
        </div>
        <div className="half-sheet-body">
          <input
            className="note-editor-title"
            placeholder="标题（可选）"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            className="note-editor-input"
            placeholder="记录领受、问题或应用…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus
            rows={8}
          />
        </div>
        <div className="half-sheet-foot half-sheet-actions">
          <button type="button" className="half-sheet-action-btn" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="half-sheet-action-btn half-sheet-action-primary"
            disabled={!text.trim()}
            onClick={() => {
              onSave({ title: title.trim(), body: text.trim() });
              onClose();
            }}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );

  if (!mounted) return null;
  return createPortal(sheet, document.body);
}
