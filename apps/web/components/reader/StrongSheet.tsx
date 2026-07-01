'use client';

import { useEffect, useState } from 'react';
import { api, type DictEntity } from '@/lib/api';

export function StrongSheet({
  refLabel,
  onClose,
}: {
  refLabel: string;
  onClose: () => void;
}) {
  const [items, setItems] = useState<DictEntity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void api.dictionary()
      .then((d) => {
        if (!cancelled) setItems(d.entities.slice(0, 12));
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet card" onClick={(e) => e.stopPropagation()}>
        <div className="section-row" style={{ marginTop: 0 }}>
          <strong>原文 · {refLabel}</strong>
          <button type="button" className="text-link" onClick={onClose}>关闭</button>
        </div>
        <p className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
          基于词典与注释摘要的轻量原文辅助（完整 Strong&apos;s 编号 Phase 3 扩展）。
        </p>
        {loading ? (
          <p className="muted">加载中…</p>
        ) : (
          <div className="reader-tools-list">
            {items.map((e) => (
              <div key={e.name} className="reader-tools-item static">
                <strong>{e.name}</strong>
                <span className="muted">{e.type} · {e.summary}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
