'use client';

import { useEffect, useState } from 'react';
import { api, type CompareResult, type CrossrefResult, type GuideResult } from '@/lib/api';
import { refToChineseLabel } from '@/lib/ref_label';
import { refSpaceToOsis } from '@/lib/inline_ref';
import { VersePreviewSheet } from '@/components/reader/VersePreviewSheet';

type Tab = 'crossrefs' | 'guide' | 'compare';

export function ReaderToolsSheet({
  refParam,
  refLabel,
  initialTab,
  onClose,
}: {
  refParam: string;
  refLabel: string;
  initialTab?: Tab;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>(initialTab ?? 'crossrefs');
  const [cross, setCross] = useState<CrossrefResult | null>(null);
  const [guide, setGuide] = useState<GuideResult | null>(null);
  const [compare, setCompare] = useState<CompareResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [previewRef, setPreviewRef] = useState<{ osis: string; label: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    const load = async () => {
      try {
        if (tab === 'crossrefs') {
          const d = await api.crossrefs(refParam);
          if (!cancelled) setCross(d);
        } else if (tab === 'guide') {
          const d = await api.guide(refParam);
          if (!cancelled) setGuide(d);
        } else {
          const d = await api.compare(refParam);
          if (!cancelled) setCompare(d);
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
    crossrefs: '串珠：列出与本节主题呼应、常被一并引用的其他经文（按关联度排序）。点击可预览经文。',
    guide: '查考资源与背景摘要（来自经库与注释索引）。',
    compare: '同一节经文在 CNV、和合本、KJV 等译本中的对照。',
  };

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose}>
        <div className="sheet card reader-tools-sheet" onClick={(e) => e.stopPropagation()}>
          <div className="section-row" style={{ marginTop: 0 }}>
            <button type="button" className="text-link" onClick={onClose}>‹ 返回</button>
            <strong>{refLabel}</strong>
            <button type="button" className="text-link" onClick={onClose}>关闭</button>
          </div>
          <div className="reader-tools-tabs">
            {([
              ['crossrefs', '相关经文'],
              ['guide', '资源'],
              ['compare', '对照'],
            ] as const).map(([id, label]) => (
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
              <p className="muted" style={{ fontSize: 12 }}>{guide.display}</p>
              {guide.passage && (
                <p style={{ lineHeight: 1.6, marginBottom: 10 }}>{guide.passage}</p>
              )}
              {guide.cards.map((c, i) => (
                <div key={i} className="reader-tools-item static">
                  <strong>{c.title}</strong>
                  <span className="muted">{c.snippet}</span>
                </div>
              ))}
            </div>
          )}
          {!loading && tab === 'compare' && compare && (
            <div className="reader-tools-list">
              {compare.versions.length === 0 ? (
                <p className="muted">暂无对照译本数据（请确认和合本/CUVS 已生成）</p>
              ) : (
                compare.versions.map((v) => (
                  <div key={v.version} className="reader-tools-compare-row">
                    <span className="muted">{v.label}</span>
                    <p style={{ lineHeight: 1.6 }}>{v.text}</p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
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
