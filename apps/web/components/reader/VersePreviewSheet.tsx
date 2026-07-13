'use client';

import { useEffect, useState } from 'react';
import { api, type Verse } from '@/lib/api';
import { refToChineseLabel } from '@/lib/ref_label';
import AppBodyPortal from '@/components/AppBodyPortal';

export function VersePreviewSheet({
  refParam,
  refLabel,
  onClose,
}: {
  refParam: string;
  refLabel?: string;
  onClose: () => void;
}) {
  const [verses, setVerses] = useState<Verse[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const label = refLabel ?? refToChineseLabel(refParam) ?? refParam;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    void api
      .scriptureRef(refParam)
      .then((d) => {
        if (cancelled) return;
        setVerses(d.verses ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setErr('无法加载经文');
          setVerses([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [refParam]);

  return (
    <AppBodyPortal>
      <div className="sheet-backdrop" onClick={onClose}>
        <div className="sheet card verse-preview-sheet" onClick={(e) => e.stopPropagation()}>
          <div className="section-row" style={{ marginTop: 0 }}>
            <strong>{label}</strong>
          </div>
          <div className="verse-preview-scroll">
            {loading && <p className="muted">加载中…</p>}
            {err && <p className="muted">{err}</p>}
            {!loading && verses.length > 0 && (
              <div className="verse-preview-list">
                {verses.map((v) => (
                  <p key={v.verse} className="verse-preview-line">
                    <sup className="verse-preview-num">{v.verse}</sup>
                    {v.text}
                  </p>
                ))}
              </div>
            )}
            {!loading && !err && verses.length === 0 && (
              <p className="muted">暂无经文</p>
            )}
          </div>
        </div>
      </div>
    </AppBodyPortal>
  );
}
