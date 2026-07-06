'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import PageBackBar from '@/components/PageBackBar';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';
import { api, type BibleDiagram } from '@/lib/api';
import { DiagramViewer } from '@/components/knowledge/DiagramViewer';
import { refSpaceToOsis } from '@/lib/inline_ref';
import { formatGroupRefLabel } from '@/lib/ref_label';
import { VersePreviewSheet } from '@/components/reader/VersePreviewSheet';

function DiagramTourPageContent() {
  const params = useParams();
  const diagramId = decodeURIComponent(String(params.id || ''));
  useEdgeSwipeBack({ href: '/search/diagrams' });

  const [diagram, setDiagram] = useState<BibleDiagram | null>(null);
  const [preview, setPreview] = useState<{ osis: string; label: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    void api
      .diagram(diagramId)
      .then((d) => setDiagram(d.diagram))
      .catch(() => setDiagram(null))
      .finally(() => setLoading(false));
  }, [diagramId]);

  return (
    <main className="container story-mode-page">
      <header className="page-head story-mode-head">
        <PageBackBar href="/search/diagrams" label="图鉴馆" />
        <h2 className="page-head-title">{diagram?.title ?? '图鉴'}</h2>
      </header>

      {loading ? <p className="muted">加载中…</p> : null}
      {!loading && diagram ? (
        <DiagramViewer
          diagram={diagram}
          guided
          onRefClick={(ref) => setPreview({
            osis: ref.includes('.') ? ref : refSpaceToOsis(ref),
            label: formatGroupRefLabel(ref) ?? ref,
          })}
        />
      ) : null}
      {!loading && !diagram ? <p className="muted">未找到该图鉴</p> : null}

      <div className="story-mode-footer-links">
        <Link href="/search/diagrams" className="text-link">切换图鉴</Link>
      </div>

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

export default function DiagramTourPage() {
  return (
    <Suspense fallback={<main className="container"><p className="muted">加载中…</p></main>}>
      <DiagramTourPageContent />
    </Suspense>
  );
}
