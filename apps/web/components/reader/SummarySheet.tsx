'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export default function SummarySheet({
  title,
  load,
  onClose,
}: {
  title: string;
  load: () => Promise<string>;
  onClose: () => void;
}) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setErr(null);
    void load()
      .then((t) => {
        if (!cancelled) setBody(t);
      })
      .catch((e) => {
        if (!cancelled) setErr(String(e));
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load, title]);

  const sheet = (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="half-sheet summary-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="half-sheet-head">
          <div className="half-sheet-grab" />
          <div className="half-sheet-title">
            <strong>{title}</strong>
            <button type="button" className="text-link" onClick={onClose}>关闭</button>
          </div>
        </div>
        <div className="half-sheet-body">
          <span className="half-sheet-badge">总结概览</span>
          {busy && !body && <p className="muted">小爱正在整理…</p>}
          {err && <p style={{ color: '#b1554a' }}>{err}</p>}
          {body && <p className="summary-sheet-body">{body}</p>}
        </div>
      </div>
    </div>
  );

  if (!mounted) return null;
  return createPortal(sheet, document.body);
}
