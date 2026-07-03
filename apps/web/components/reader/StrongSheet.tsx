'use client';

import { useEffect, useState } from 'react';
import { api, type StrongsWord } from '@/lib/api';

export function StrongSheet({
  refParam,
  refLabel,
  onClose,
}: {
  refParam: string;
  refLabel: string;
  onClose: () => void;
}) {
  const [words, setWords] = useState<StrongsWord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void api.strongs(refParam)
      .then((d) => {
        if (!cancelled) setWords(d.words || []);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [refParam]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet card" onClick={(e) => e.stopPropagation()}>
        <div className="section-row" style={{ marginTop: 0 }}>
          <strong>原文 · {refLabel}</strong>
          <button type="button" className="text-link" onClick={onClose}>关闭</button>
        </div>
        <p className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
          希腊文逐词 + Strong&apos;s 编号（Gnosis，CC-BY-SA）。
        </p>
        {loading ? (
          <p className="muted">加载中…</p>
        ) : words.length === 0 ? (
          <p className="muted">暂无该节原文数据（目前覆盖新约希腊文）。</p>
        ) : (
          <div className="reader-tools-list">
            {words.map((w) => (
              <div key={w.position} className="reader-tools-item">
                <strong>{w.word}</strong>
                {w.strongs ? <span className="muted"> · {w.strongs}</span> : null}
                {w.morphology ? <span className="muted"> · {w.morphology}</span> : null}
                {w.gloss ? <p style={{ margin: '4px 0 0', fontSize: 13 }}>{w.gloss}</p> : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
