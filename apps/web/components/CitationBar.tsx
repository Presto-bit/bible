'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { explainCitation, type Citation } from '@/lib/api';
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

const DISCLAIMER =
  '以下中文为便于阅读的释义，非官方译本；请以圣经与原文摘录为准。';

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
  const [explainZh, setExplainZh] = useState('');
  const [explainErr, setExplainErr] = useState('');
  const [explainLoading, setExplainLoading] = useState(false);
  const [snippetExpanded, setSnippetExpanded] = useState(false);
  const [disclaimer, setDisclaimer] = useState(DISCLAIMER);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (controlled === undefined) return;
    if (controlled != null) {
      setSheetOpen(true);
      setDetailN(controlled);
    }
  }, [controlled]);

  const detail = detailN != null ? citations.find((c) => c.n === detailN) ?? null : null;

  useEffect(() => {
    if (!detail?.snippet) {
      setExplainZh('');
      setExplainErr('');
      setExplainLoading(false);
      return;
    }
    let cancelled = false;
    setExplainLoading(true);
    setExplainZh('');
    setExplainErr('');
    setSnippetExpanded(false);
    void explainCitation({ title: detail.title, snippet: detail.snippet })
      .then((res) => {
        if (cancelled) return;
        setExplainZh(res.explain_zh || '');
        setDisclaimer(res.disclaimer || DISCLAIMER);
        if (res.error) setExplainErr(res.error);
      })
      .catch(() => {
        if (!cancelled) setExplainErr('暂无法生成中文释义');
      })
      .finally(() => {
        if (!cancelled) setExplainLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [detail?.n, detail?.snippet, detail?.title]);

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
  const snip = detail?.snippet?.trim() || '';
  const snipLong = snip.length > 180;

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
                  <div className="citation-bilingual" style={{ marginTop: 12 }}>
                    <p className="citation-bilingual-label muted" style={{ margin: '0 0 6px', fontSize: 12 }}>
                      中文释义
                    </p>
                    {explainLoading ? (
                      <p className="muted">正在生成释义…</p>
                    ) : explainZh ? (
                      <p className="citation-popup-body citation-explain-zh" style={{ marginTop: 0 }}>
                        {explainZh}
                      </p>
                    ) : (
                      <p className="muted">{explainErr || '暂无法生成中文释义'}</p>
                    )}
                    <p className="citation-bilingual-label muted" style={{ margin: '14px 0 6px', fontSize: 12 }}>
                      原文摘录
                    </p>
                    {snip ? (
                      <>
                        <p
                          className="citation-popup-body citation-snippet-orig"
                          style={{
                            marginTop: 0,
                            maxHeight: snippetExpanded ? undefined : '5.2em',
                            overflow: snippetExpanded ? undefined : 'hidden',
                          }}
                        >
                          {snip}
                        </p>
                        {snipLong && (
                          <button
                            type="button"
                            className="text-link"
                            style={{ marginTop: 4 }}
                            onClick={() => setSnippetExpanded((v) => !v)}
                          >
                            {snippetExpanded ? '收起' : '展开更多'}
                          </button>
                        )}
                      </>
                    ) : (
                      <p className="muted">暂无摘录内容</p>
                    )}
                    <p className="muted" style={{ marginTop: 14, fontSize: 11, lineHeight: 1.5 }}>
                      {disclaimer}
                    </p>
                  </div>
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
