'use client';

import { useState } from 'react';
import { refToChineseLabel } from '@/lib/ref_label';

export default function ThoughtWriteSheet({
  refLabel,
  verseText,
  onPublish,
  onClose,
}: {
  refLabel: string;
  verseText?: string;
  onPublish: (body: string) => void;
  onClose: () => void;
}) {
  const [body, setBody] = useState('');
  const cnRef = refToChineseLabel(refLabel) ?? refLabel;

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet card thought-write-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="half-sheet-grab" aria-hidden />
        <div className="section-row" style={{ marginTop: 0 }}>
          <strong>写想法</strong>
          <button type="button" className="text-link" onClick={onClose}>关闭</button>
        </div>

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
          想法将公开给读同一节经文的人
        </p>
        <textarea
          className="note-editor-input"
          rows={5}
          autoFocus
          placeholder="写下你的领受、疑问或祷告…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <button
          type="button"
          className="btn"
          style={{ width: '100%', marginTop: 12 }}
          onClick={() => {
            const t = body.trim();
            if (!t) return;
            onPublish(t);
          }}
        >
          发布
        </button>
      </div>
    </div>
  );
}
