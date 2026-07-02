'use client';

import { useState } from 'react';
import { upsertMarkNote } from '@/lib/mark_notes';

type Props = {
  refStr: string;
  refLabel: string;
  onSaved: () => void;
  onDismiss: () => void;
};

/** 划线后轻量笔记条（微信读书式，不离开阅读流）。 */
export default function MarkNoteBar({ refStr, refLabel, onSaved, onDismiss }: Props) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const body = draft.trim();
    if (!body) {
      onDismiss();
      return;
    }
    setBusy(true);
    try {
      upsertMarkNote(refStr, body);
      onSaved();
      onDismiss();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mark-note-bar" onClick={(e) => e.stopPropagation()}>
      <p className="mark-note-bar-label">为「{refLabel}」写灵修笔记</p>
      <input
        className="mark-note-bar-input"
        placeholder="记录领受、疑问或祷告…"
        value={draft}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') onDismiss();
        }}
      />
      <div className="mark-note-bar-actions">
        <button type="button" className="text-link" onClick={onDismiss}>
          跳过
        </button>
        <button type="button" className="btn btn-sm" disabled={busy} onClick={save}>
          保存
        </button>
      </div>
    </div>
  );
}
