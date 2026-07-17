'use client';

import { useEffect, useState } from 'react';
import { api, type CrossrefResult, type GuideResult } from '@/lib/api';
import { refToChineseLabel } from '@/lib/ref_label';
import { refSpaceToOsis } from '@/lib/inline_ref';
import { VersePreviewSheet } from '@/components/reader/VersePreviewSheet';
import PageBackBar, { SheetCloseButton } from '@/components/PageBackBar';
import { recordCrossrefOpen } from '@/lib/badge_events';
import AppBodyPortal from '@/components/AppBodyPortal';
import { getSessionKnowledgeBaseId } from '@/lib/assistant_knowledge_base';

type Tab = 'crossrefs' | 'guide';

export function ReaderToolsSheet({
  refParam,
  refLabel,
  sourceText,
  initialTab,
  onClose,
}: {
  refParam: string;
  refLabel: string;
  /** 打开面板时选中的经文原文 */
  sourceText?: string;
  initialTab?: Tab;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>(initialTab ?? 'crossrefs');
  const [cross, setCross] = useState<CrossrefResult | null>(null);
  const [guide, setGuide] = useState<GuideResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [previewRef, setPreviewRef] = useState<{ osis: string; label: string } | null>(null);

  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    const load = async () => {
      try {
        if (tab === 'crossrefs') {
          const d = await api.crossrefs(refParam);
          if (!cancelled) {
            setCross(d);
            recordCrossrefOpen();
          }
        } else if (tab === 'guide') {
          const d = await api.guide(refParam, getSessionKnowledgeBaseId());
          if (!cancelled) setGuide(d);
        }
      } catch (e) {
        if (!cancelled) setErr(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [tab, refParam]);

  const tabHint: Record<Tab, string> = {
    crossrefs: '与本节主题呼应、常被一并引用的经文。点击可预览。',
    guide: '查考资源与背景摘要（来自经库与注释索引）。',
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'crossrefs', label: '相关经文' },
    { id: 'guide', label: '资源' },
  ];

  return (
    <>
      <AppBodyPortal>
        <div className="sheet-backdrop" onClick={onClose}>
          <div className="sheet card reader-tools-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="section-row" style={{ marginTop: 0 }}>
              <PageBackBar variant="sheet" onClick={onClose} label="返回" />
              <strong>{refLabel}</strong>
              <SheetCloseButton onClick={onClose} />
            </div>
            <div className="reader-tools-tabs">
              {tabs.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  className={`mode-chip ${tab === id ? 'mode-chip-active' : ''}`}
                  onClick={() => setTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="muted reader-tools-hint">{tabHint[tab]}</p>
            {sourceText ? (
              <div className="thought-verse-card reader-tools-source">
                <span className="thought-verse-label">所选经文</span>
                <strong className="thought-verse-ref">{refLabel}</strong>
                <p className="thought-verse-text">{sourceText}</p>
              </div>
            ) : null}
            {loading && <p className="muted">加载中…</p>}
            {err && <p className="muted">{err}</p>}
            {!loading && tab === 'crossrefs' && cross && (
              <div className="reader-tools-list">
                <p className="muted" style={{ fontSize: 12 }}>
                  {cross.label}
                  {cross.count != null ? ` · 共 ${cross.count} 条` : ''}
                </p>
                {cross.related.length === 0 ? (
                  <p className="muted">暂无相关经文</p>
                ) : (
                  cross.related.map((r) => {
                    const osis = refSpaceToOsis(r.ref);
                    return (
                      <button
                        key={r.ref}
                        type="button"
                        className="reader-tools-item reader-tools-item-btn"
                        onClick={() => setPreviewRef({
                          osis,
                          label: refToChineseLabel(r.ref) ?? r.ref,
                        })}
                      >
                        <strong>{refToChineseLabel(r.ref) ?? r.ref}</strong>
                        <span className="muted">{r.text}</span>
                      </button>
                    );
                  })
                )}
              </div>
            )}
            {!loading && tab === 'guide' && guide && (
              <div className="reader-tools-list">
                <p className="muted" style={{ fontSize: 12 }}>
                  {guide.display}
                  {guide.knowledge_base_name ? ` · ${guide.knowledge_base_name}` : ''}
                </p>
                {guide.passage && (
                  <p style={{ lineHeight: 1.6, marginBottom: 10 }}>{guide.passage}</p>
                )}
                {guide.cards.map((c, i) => (
                  <div key={i} className="reader-tools-item static">
                    <strong>{c.title}</strong>
                    <span className="muted">{c.snippet}</span>
                  </div>
                ))}
                {guide.cards.length === 0 && (
                  <p className="muted">当前知识库暂无对应资料</p>
                )}
              </div>
            )}
          </div>
        </div>
      </AppBodyPortal>
      {previewRef && (
        <VersePreviewSheet
          refParam={previewRef.osis}
          refLabel={previewRef.label}
          onClose={() => setPreviewRef(null)}
        />
      )}
    </>
  );
}
