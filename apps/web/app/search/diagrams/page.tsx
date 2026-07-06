'use client';

import { useEffect, useState } from 'react';
import PageBackBar from '@/components/PageBackBar';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';
import { api, type BibleDiagram } from '@/lib/api';
import { DiagramViewer } from '@/components/knowledge/DiagramViewer';
import { refSpaceToOsis } from '@/lib/inline_ref';
import { formatGroupRefLabel } from '@/lib/ref_label';
import { VersePreviewSheet } from '@/components/reader/VersePreviewSheet';

export default function SearchDiagramsPage() {
  useEdgeSwipeBack({ href: '/search' });
  const [items, setItems] = useState<BibleDiagram[]>([]);
  const [categories, setCategories] = useState<{ id: string; label: string }[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ osis: string; label: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api
      .diagrams()
      .then((d) => {
        setItems(d.items ?? []);
        setCategories(d.categories ?? []);
        setOpenId(d.items?.[0]?.id ?? null);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  const catLabel = (id: string) => categories.find((c) => c.id === id)?.label ?? id;
  const open = items.find((d) => d.id === openId) ?? null;

  return (
    <main className="container">
      <header className="page-head">
        <PageBackBar href="/search" label="搜索" />
        <h2 className="page-head-title">图鉴馆</h2>
      </header>
      <p className="muted" style={{ fontSize: 13, lineHeight: 1.5, marginTop: 8 }}>
        会幕、约柜等示意图；角标「示意图 · 非考古复原」。
      </p>

      {loading ? <p className="muted">加载中…</p> : null}

      <div className="diagram-gallery-grid" style={{ marginTop: 14 }}>
        {items.map((d) => (
          <button
            key={d.id}
            type="button"
            className={`card card-2 diagram-gallery-card${openId === d.id ? ' is-active' : ''}`}
            onClick={() => setOpenId(d.id)}
          >
            <span className="muted" style={{ fontSize: 11 }}>{catLabel(d.category)}</span>
            <strong>{d.title}</strong>
          </button>
        ))}
      </div>

      {open ? (
        <div style={{ marginTop: 16 }}>
          <DiagramViewer
            diagram={open}
            onRefClick={(ref) => setPreview({
              osis: ref.includes('.') ? ref : refSpaceToOsis(ref),
              label: formatGroupRefLabel(ref) ?? ref,
            })}
          />
        </div>
      ) : null}

      {!loading && items.length === 0 ? (
        <p className="muted" style={{ marginTop: 12 }}>暂无图鉴</p>
      ) : null}

      {preview ? (
        <VersePreviewSheet
          refParam={preview.osis}
          refLabel={preview.label}
          onClose={() => setPreview(null)}
        />
      ) : null}
    </main>
  );
}
