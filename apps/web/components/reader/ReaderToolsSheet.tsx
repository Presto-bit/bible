'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, type CompareResult, type CrossrefResult, type GuideResult } from '@/lib/api';
import { readerHrefFromRef } from '@/lib/group_footprint';

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

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet card reader-tools-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="section-row" style={{ marginTop: 0 }}>
          <strong>{refLabel}</strong>
          <button type="button" className="text-link" onClick={onClose}>关闭</button>
        </div>
        <div className="reader-tools-tabs">
          {([
            ['crossrefs', '串珠'],
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
        {loading && <p className="muted">加载中…</p>}
        {err && <p className="muted">{err}</p>}
        {!loading && tab === 'crossrefs' && cross && (
          <div className="reader-tools-list">
            <p className="muted" style={{ fontSize: 12 }}>{cross.label}</p>
            {cross.related.length === 0 ? (
              <p className="muted">暂无相关经文</p>
            ) : (
              cross.related.map((r) => {
                const href = readerHrefFromRef(r.ref.replace(/\s/g, '.'));
                return (
                  <Link key={r.ref} href={href || '/reader'} className="reader-tools-item">
                    <strong>{r.ref}</strong>
                    <span className="muted">{r.text}</span>
                  </Link>
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
            {compare.versions.map((v) => (
              <div key={v.version} className="reader-tools-compare-row">
                <span className="muted">{v.label}</span>
                <p style={{ lineHeight: 1.6 }}>{v.text}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
