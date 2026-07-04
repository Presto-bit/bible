'use client';

import { useEffect, useState } from 'react';
import type { Citation } from '@/lib/api';

type Props = {
  citations: Citation[];
  className?: string;
  activeN?: number | null;
  onActiveChange?: (n: number | null) => void;
};

export function CitationBar({
  citations,
  className,
  activeN: controlled,
  onActiveChange,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [popupN, setPopupN] = useState<number | null>(null);

  useEffect(() => {
    // 脚标点击：只弹窗，不强制展开底部列表
    if (controlled == null) return;
    setPopupN(controlled);
  }, [controlled]);

  if (!citations.length) return null;

  const setActive = (n: number | null) => {
    onActiveChange?.(n);
    setPopupN(n);
  };

  const active = citations.find((c) => c.n === popupN) ?? null;

  return (
    <div className={className ?? 'assistant-citations'}>
      <button
        type="button"
        className="assistant-citations-toggle"
        onClick={() => {
          const next = !expanded;
          setExpanded(next);
          if (!next) setActive(null);
        }}
      >
        参考资料（{citations.length}）
        <span className="muted">{expanded ? '收起' : '展开'}</span>
      </button>
      {expanded && (
        <div className="assistant-citations-list">
          {citations.map((c) => (
            <div
              key={c.n}
              className={`assistant-citation-item${popupN === c.n ? ' active' : ''}`}
            >
              <button
                type="button"
                className="assistant-citation-head"
                onClick={() => setActive(popupN === c.n ? null : c.n)}
              >
                <span className="assistant-citation-n">[{c.n}]</span>
                <span className="assistant-citation-title">{c.title}</span>
              </button>
              {popupN === c.n && c.snippet && (
                <p className="assistant-citation-snippet">{c.snippet}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {active && (
        <div
          className="sheet-backdrop citation-popup-backdrop"
          onClick={() => setActive(null)}
          role="presentation"
        >
          <div
            className="sheet card citation-popup-sheet"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={`参考资料 [${active.n}]`}
          >
            <div className="section-row" style={{ marginTop: 0 }}>
              <strong>
                [{active.n}] {active.title}
              </strong>
              <button type="button" className="text-link" onClick={() => setActive(null)}>
                关闭
              </button>
            </div>
            {active.snippet ? (
              <p className="citation-popup-body">{active.snippet}</p>
            ) : (
              <p className="muted">暂无摘录内容</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
