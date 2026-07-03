'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { readerHrefFromRef } from '@/lib/group_footprint';
import { refToChineseLabel } from '@/lib/ref_label';

export function VersePreviewSheet({
  refParam,
  refLabel,
  onClose,
}: {
  refParam: string;
  refLabel?: string;
  onClose: () => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const label = refLabel ?? refToChineseLabel(refParam) ?? refParam;
  const href = readerHrefFromRef(refParam);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    void api
      .scriptureRef(refParam)
      .then((d) => {
        if (cancelled) return;
        const body = (d.verses ?? []).map((v) => v.text).join(' ');
        setText(body || null);
      })
      .catch(() => {
        if (!cancelled) {
          setErr('无法加载经文');
          setText(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [refParam]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet card verse-preview-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="section-row" style={{ marginTop: 0 }}>
          <button type="button" className="text-link" onClick={onClose}>‹ 返回</button>
          <strong>{label}</strong>
          <span />
        </div>
        {loading && <p className="muted">加载中…</p>}
        {err && <p className="muted">{err}</p>}
        {!loading && text && (
          <p style={{ lineHeight: 1.75, marginTop: 8 }}>{text}</p>
        )}
        <div className="share-actions" style={{ marginTop: 14 }}>
          {href ? (
            <Link className="btn" href={href} onClick={onClose}>
              前往阅读
            </Link>
          ) : null}
          <button type="button" className="font-pill" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
}
