'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Citation } from '@/lib/api';
import { formatCitationTitle } from '@/lib/citation_display';

type Props = {
  citations: Citation[];
  className?: string;
  /** action：与复制/存笔记/分享并列的紧凑按钮 */
  variant?: 'inline' | 'action';
  /** 底栏窄屏时用更短文案 */
  compact?: boolean;
  activeN?: number | null;
  onActiveChange?: (n: number | null) => void;
  bookName?: string;
};

export function CitationBar({
  citations,
  className,
  variant = 'inline',
  compact = false,
  activeN: controlled,
  onActiveChange,
  bookName,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [detailN, setDetailN] = useState<number | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (controlled === undefined) return;
    if (controlled != null) {
      setSheetOpen(true);
      setDetailN(controlled);
    }
  }, [controlled]);

  if (!citations.length) return null;

  const closeSheet = () => {
    setSheetOpen(false);
    setDetailN(null);
    onActiveChange?.(null);
  };

  const openSheet = () => {
    setSheetOpen(true);
    setDetailN(null);
  };

  const openDetail = (n: number) => {
    onActiveChange?.(n);
    setDetailN(n);
    setSheetOpen(true);
  };

  const displayTitle = (c: Citation) => formatCitationTitle(c.title, bookName);
  const detail = detailN != null ? citations.find((c) => c.n === detailN) ?? null : null;

  const trigger =
    variant === 'action' ? (
      <button
        type="button"
        className={['citation-action-btn', className ?? 'msg-action'].filter(Boolean).join(' ')}
        onClick={openSheet}
      >
        {compact ? `释经·${citations.length}` : `释经资料（${citations.length}）`}
      </button>
    ) : (
      <button
        type="button"
        className={['assistant-citations-toggle', 'citation-action-btn', className].filter(Boolean).join(' ')}
        onClick={openSheet}
      >
        {compact ? `释经·${citations.length}` : `释经资料（${citations.length}）`}
      </button>
    );

  const modal =
    sheetOpen && mounted
      ? createPortal(
          <div
            className="sheet-backdrop citation-popup-backdrop"
            onClick={closeSheet}
            role="presentation"
          >
            <div
              className="sheet card citation-popup-sheet"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="释经资料"
            >
              {detail ? (
                <>
                  <div className="section-row" style={{ marginTop: 0 }}>
                    <strong>
                      [{detail.n}] {displayTitle(detail)}
                    </strong>
                    <button type="button" className="text-link" onClick={() => setDetailN(null)}>
                      返回列表
                    </button>
                  </div>
                  {detail.snippet ? (
                    <p className="citation-popup-body">{detail.snippet}</p>
                  ) : (
                    <p className="muted">暂无摘录内容</p>
                  )}
                </>
              ) : (
                <>
                  <div className="section-row" style={{ marginTop: 0 }}>
                    <strong>释经资料（{citations.length}）</strong>
                    <button type="button" className="text-link" onClick={closeSheet}>
                      关闭
                    </button>
                  </div>
                  <div className="assistant-citations-list" style={{ marginTop: 10 }}>
                    {citations.map((c) => (
                      <button
                        key={c.n}
                        type="button"
                        className="assistant-citation-head"
                        style={{ width: '100%', textAlign: 'left' }}
                        onClick={() => openDetail(c.n)}
                      >
                        <span className="assistant-citation-n">[{c.n}]</span>
                        <span className="assistant-citation-title">{displayTitle(c)}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      {trigger}
      {modal}
    </>
  );
}
