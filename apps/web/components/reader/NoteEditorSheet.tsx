'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export default function NoteEditorSheet({
  refLabel,
  onSave,
  onClose,
}: {
  refLabel: string;
  onSave: (body: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const sheet = (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="half-sheet note-editor-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="half-sheet-head">
          <div className="half-sheet-grab" />
          <div className="half-sheet-title">
            <strong>写笔记 · {refLabel}</strong>
            <button type="button" className="text-link" onClick={onClose}>关闭</button>
          </div>
        </div>
        <div className="half-sheet-body">
          <textarea
            className="note-editor-input"
            placeholder="记录你的领受、问题或应用…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus
            rows={6}
          />
        </div>
        <div className="half-sheet-foot half-sheet-actions">
          <button type="button" className="half-sheet-action-btn" onClick={onClose}>取消</button>
          <button
            type="button"
            className="half-sheet-action-btn half-sheet-action-primary"
            disabled={!text.trim()}
            onClick={() => {
              onSave(text.trim());
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
