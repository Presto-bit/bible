'use client';

import { useEffect, useState } from 'react';
import { api, type CrossrefResult, type GuideResult, type StrongsWord } from '@/lib/api';
import { refToChineseLabel } from '@/lib/ref_label';
import { refSpaceToOsis } from '@/lib/inline_ref';
import { VersePreviewSheet } from '@/components/reader/VersePreviewSheet';

type Tab = 'crossrefs' | 'strongs' | 'guide';

export function ReaderToolsSheet({
  refParam,
  refLabel,
  initialTab,
  singleVerse,
  onClose,
}: {
  refParam: string;
  refLabel: string;
  initialTab?: Tab;
  /** 选中单节时可查希腊原文 */
  singleVerse?: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>(initialTab ?? 'crossrefs');
  const [cross, setCross] = useState<CrossrefResult | null>(null);
  const [guide, setGuide] = useState<GuideResult | null>(null);
  const [words, setWords] = useState<StrongsWord[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [previewRef, setPreviewRef] = useState<{ osis: string; label: string } | null>(null);

  useEffect(() => {
    if (initialTab && initialTab !== 'strongs') setTab(initialTab);
    else if (initialTab === 'strongs') setTab('crossrefs');
  }, [initialTab]);

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
        } else if (tab === 'strongs' && singleVerse) {
          const d = await api.strongs(refParam);
          if (!cancelled) setWords(d.words || []);
        } else if (tab === 'strongs') {
          if (!cancelled) setWords([]);
        }
      } catch (e) {
        if (!cancelled) setErr(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [tab, refParam, singleVerse]);

  const tabHint: Record<Tab, string> = {
    crossrefs: '与本节主题呼应、常被一并引用的经文。点击可预览。',
    strongs: '新约希腊文逐词、Strong\'s 编号与释义（旧约希伯来文陆续补充）。',
    guide: '查考资源与背景摘要（来自经库与注释索引）。',
  };

  // 原文（Strong's）产品重设计前暂时下线
  const tabs: { id: Tab; label: string; hidden?: boolean }[] = [
    { id: 'crossrefs', label: '相关经文' },
    { id: 'strongs', label: '原文', hidden: true },
    { id: 'guide', label: '资源' },
  ];

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
            {tabs.filter((t) => !t.hidden).map(({ id, label }) => (
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
          {!loading && tab === 'strongs' && (
            <div className="reader-tools-list">
              {words.length === 0 ? (
                <p className="muted">暂无该节原文数据（多为旧约经节或数据未就绪）。</p>
              ) : (
                words.map((w) => (
                  <div key={w.position} className="reader-tools-item static">
                    <strong>{w.word}</strong>
                    {w.strongs ? <span className="muted"> · {w.strongs}</span> : null}
                    {w.transliteration ? <span className="muted"> · {w.transliteration}</span> : null}
                    {w.morphology ? <span className="muted"> · {w.morphology}</span> : null}
                    {w.gloss ? <p style={{ margin: '4px 0 0', fontSize: 13 }}>{w.gloss}</p> : null}
                  </div>
                ))
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
