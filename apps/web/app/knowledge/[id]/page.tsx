'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { api, type KnowledgeLayout } from '@/lib/api';
import PageBackBar from '@/components/PageBackBar';
import { useFlowBack } from '@/lib/use_edge_swipe_back';
import { manuscriptPagesFromLayout } from '@/components/knowledge/KnowledgeManuscriptFolio';
import { KnowledgeManuscriptViewer } from '@/components/knowledge/KnowledgeManuscriptViewer';
import { knowledgeRasterSources } from '@/lib/knowledge_media_url';
import { readManuscriptPage } from '@/lib/manuscript_progress';
import { markRouteNavigation } from '@/lib/pwa_tab_nav';
import { markKnowledgeSoftReturn } from '@/lib/knowledge_nav';

/** 运营笔记手稿：无地图 tour，直接读 layout */
export default function KnowledgeNotePage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const noteId = decodeURIComponent(String(params.id || ''));
  const openFromQuery = searchParams.get('view') === '1';
  const fromHome = searchParams.get('from') === 'home';
  const flowBack = useFlowBack('/knowledge');
  const goTopics = useCallback(() => {
    markKnowledgeSoftReturn();
    markRouteNavigation();
    router.replace('/knowledge');
  }, [router]);
  const leave = useCallback(() => {
    markKnowledgeSoftReturn();
    flowBack();
  }, [flowBack]);
  const exitToList = fromHome ? goTopics : leave;

  const [layout, setLayout] = useState<KnowledgeLayout | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(openFromQuery);
  const [resumePage, setResumePage] = useState(0);

  useEffect(() => {
    if (!noteId) {
      setLoading(false);
      setFailed(true);
      return;
    }
    setLoading(true);
    setFailed(false);
    void api
      .knowledgeLayout(noteId)
      .then((res) => setLayout(res.layout))
      .catch(() => {
        setLayout(null);
        setFailed(true);
      })
      .finally(() => setLoading(false));
  }, [noteId]);

  const pages = useMemo(
    () => (layout ? manuscriptPagesFromLayout(layout) : []),
    [layout],
  );

  const coverSources = useMemo(() => {
    if (!layout) {
      return knowledgeRasterSources('/knowledge/infographics/_paper_texture.jpg');
    }
    const fromPage = pages[0]?.src;
    return knowledgeRasterSources(
      fromPage ||
        layout.cover_image ||
        '/knowledge/infographics/_paper_texture.jpg',
    );
  }, [layout, pages]);

  useEffect(() => {
    if (!noteId) return;
    setResumePage(readManuscriptPage(noteId, pages.length || undefined));
  }, [noteId, pages.length]);

  useEffect(() => {
    if (openFromQuery) setViewerOpen(true);
  }, [openFromQuery, noteId]);

  if (loading) {
    return (
      <main className="container">
        <p className="muted">正在载入…</p>
      </main>
    );
  }

  if (failed || !layout) {
    return (
      <main className="container">
        <PageBackBar onClick={exitToList} label="探索" />
        <p className="muted">未找到该手稿</p>
      </main>
    );
  }

  const title = layout.title || noteId;
  const guide = layout.guide_one_liner || '';
  const closeViewer = () => {
    setResumePage(readManuscriptPage(noteId, pages.length || undefined));
    if (openFromQuery) {
      exitToList();
      return;
    }
    setViewerOpen(false);
  };

  return (
    <main className="container story-mode-page knowledge-explainer-page">
      <div className="knowledge-explainer knowledge-explainer--cover">
        {!viewerOpen ? (
          <>
            <header className="page-head story-mode-head">
              <PageBackBar onClick={exitToList} label="探索" />
              <h2 className="page-head-title">{title}</h2>
            </header>
            <button
              type="button"
              className="knowledge-cover-card"
              onClick={() => setViewerOpen(true)}
              aria-label={
                resumePage > 0
                  ? `续读「${title}」，第 ${resumePage + 1} 页`
                  : `打开「${title}」手稿`
              }
            >
              <picture>
                {coverSources.webp ? (
                  <source type="image/webp" srcSet={coverSources.webp} />
                ) : null}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="knowledge-cover-card-photo"
                  src={coverSources.fallback}
                  alt=""
                  decoding="async"
                />
              </picture>
              <span className="knowledge-cover-card-body">
                <span className="knowledge-cover-card-badge">彼爱手稿 · 笔记</span>
                <span className="knowledge-cover-card-title">{title}</span>
                {guide ? <span className="knowledge-cover-card-guide">{guide}</span> : null}
                <span className="knowledge-cover-card-cta">
                  {resumePage > 0
                    ? `续读第 ${resumePage + 1} 页 · 共 ${pages.length} 页`
                    : `共 ${pages.length} 页 · 左右滑动`}
                </span>
              </span>
            </button>
            <p className="knowledge-explainer-disclaimer">释义说明，仅供参考</p>
          </>
        ) : null}

        {viewerOpen ? (
          <KnowledgeManuscriptViewer
            pages={pages}
            title={title}
            tourId={noteId}
            onClose={closeViewer}
            onExitTopic={exitToList}
          />
        ) : null}
      </div>
    </main>
  );
}
