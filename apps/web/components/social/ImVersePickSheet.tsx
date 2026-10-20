'use client';

import { useEffect, useState } from 'react';
import { formatGroupRefLabel } from '@/lib/ref_label';
import { buildCheckinRef } from '@/lib/group_checkin';
import { loadFootprintRefs, type FootprintRef } from '@/lib/group_footprint';
import { groupFootprintsBySource } from '@/lib/group_ui';
import { getLastRead } from '@/lib/reading';

type Props = {
  open: boolean;
  onClose: () => void;
  onSend: (payload: { ref: string; body?: string }) => Promise<void>;
};

/** 私聊加号：用当前阅读位置发经文卡。 */
export function ImVersePickSheet({ open, onClose, onSend }: Props) {
  const [ref, setRef] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [picking, setPicking] = useState(false);
  const [footprints, setFootprints] = useState<FootprintRef[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const last = getLastRead();
    setRef(last ? buildCheckinRef(last.bookId, last.chapter) : null);
    setNote('');
    setPicking(false);
    setErr(null);
    void loadFootprintRefs({}).then(setFootprints);
  }, [open]);

  if (!open) return null;

  const groups = groupFootprintsBySource(footprints);

  const send = async () => {
    if (!ref || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await onSend({ ref, body: note.trim() || undefined });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '发送失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sheet-backdrop group-composer-backdrop" onClick={onClose}>
      <div
        className="sheet card group-composer-sheet group-composer-sheet-slim"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="half-sheet-grab" aria-hidden />
        <div className="section-row" style={{ marginTop: 0, marginBottom: 8 }}>
          <strong>经文</strong>
          <button type="button" className="text-link" onClick={onClose}>
            关闭
          </button>
        </div>
        <p className="group-checkin-ref">
          {ref ? formatGroupRefLabel(ref) : '还没有最近阅读'}
        </p>
        <button type="button" className="text-link" onClick={() => setPicking((v) => !v)}>
          {picking ? '收起' : '换一节'}
        </button>
        {picking ? (
          <div className="group-composer-section">
            {groups.length === 0 ? (
              <p className="muted">读过或收藏的经节会出现在这里。</p>
            ) : groups.map((g) => (
              <div key={g.source} className="group-footprint-group">
                <span className="group-footprint-source">{g.label}</span>
                <div className="chip-swipe group-chip-swipe">
                  {g.items.map((f) => (
                    <button
                      key={`${f.source}-${f.ref}`}
                      type="button"
                      className={`group-chip chip-swipe-item${ref === f.ref ? ' selected' : ''}`}
                      onClick={() => {
                        setRef(f.ref);
                        setPicking(false);
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}
        <textarea
          className="group-composer-text search-input compose-textarea"
          rows={2}
          maxLength={120}
          placeholder="加一句（可选）"
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 120))}
        />
        {!ref ? <p className="muted">先选一节经文</p> : null}
        {err ? <p className="group-composer-err">{err}</p> : null}
        <button type="button" className="btn btn-block" disabled={!ref || busy} onClick={() => void send()}>
          {busy ? '发送中…' : '发送经文'}
        </button>
      </div>
    </div>
  );
}
