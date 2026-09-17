'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import PageBackBar from '@/components/PageBackBar';
import { useFlowBack } from '@/lib/use_edge_swipe_back';
import type { KnowledgeLayoutSummary } from '@/lib/api';
import { knowledgeRasterSources } from '@/lib/knowledge_media_url';
import { knowledgeLayoutViewHref } from '@/lib/topic_routes';
import {
  consumeKnowledgeSoftReturn,
  getKnowledgeExpandSession,
  startKnowledgeExpand,
  subscribeKnowledgeExpand,
} from '@/lib/knowledge_nav';
import {
  knowledgeKindLabel,
  knowledgeMediaBadge,
  resolveKnowledgeTopicMeta,
} from '@/lib/knowledge_topic_meta';
import { adminCheck, deleteKnowledgeNote } from '@/lib/admin_rag';

function coverPath(row: KnowledgeLayoutSummary): string {
  if (row.cover_image) return row.cover_image;
  const id = row.id || '';
  if (id === 'exodus-wilderness') {
    return '/knowledge/vignettes/wilderness/00_overview.png';
  }
  if (id === 'paul-first-journey') {
    // 列表用轻量脊图，勿用 1080×1920 comic
    return '/knowledge/infographics/paul-first-journey.png';
  }
  return '/knowledge/infographics/_paper_texture.jpg';
}

function preloadRaster(path: string) {
  if (typeof window === 'undefined') return;
  const { webp, fallback } = knowledgeRasterSources(path);
  if (webp) {
    const a = new Image();
    a.decoding = 'async';
    a.src = webp;
  }
  const b = new Image();
  b.decoding = 'async';
  b.src = fallback;
}

function shortTitle(title: string): string {
  const t = title.trim();
  // 两列卡可排约 2–3 行；勿在「保罗第一次宣教旅程」这类完整题名上硬截半截
  if (t.length <= 18) return t;
  return `${t.slice(0, 17)}…`;
}

function shortHook(guide?: string): string {
  const g = (guide || '').trim();
  if (!g) return '';
  if (g.length <= 42) return g;
  return `${g.slice(0, 41)}…`;
}

function isNoteRow(row: KnowledgeLayoutSummary): boolean {
  return (
    row.kind === 'note' ||
    row.source?.kind === 'note' ||
    (row.id || '').startsWith('note-')
  );
}

function scheduleIdle(fn: () => void, timeout = 900): () => void {
  if (typeof window === 'undefined') return () => {};
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (typeof w.requestIdleCallback === 'function') {
    const id = w.requestIdleCallback(fn, { timeout });
    return () => w.cancelIdleCallback?.(id);
  }
  const t = window.setTimeout(fn, 120);
  return () => window.clearTimeout(t);
}

type FilterId = 'all' | 'journey' | 'note';

type Props = {
  initialLayouts: KnowledgeLayoutSummary[];
};

/**
 * 探索列表：1 行 2 卡封面流（点进直达全屏），对齐已拍板方案。
 */
export function KnowledgeTopicsClient({ initialLayouts }: Props) {
  const goBack = useFlowBack('/');
  const [rows, setRows] = useState(initialLayouts);
  const [filter, setFilter] = useState<FilterId>('all');
  const [isAdmin, setIsAdmin] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [softReturn, setSoftReturn] = useState(false);

  useEffect(() => {
    setRows(initialLayouts);
  }, [initialLayouts]);

  useEffect(() => {
    const soft = consumeKnowledgeSoftReturn();
    if (!soft) return;
    setSoftReturn(true);
    const unsub = subscribeKnowledgeExpand(() => {
      if (!getKnowledgeExpandSession()) setSoftReturn(false);
    });
    const t = window.setTimeout(() => setSoftReturn(false), 420);
    return () => {
      unsub();
      window.clearTimeout(t);
    };
  }, []);

  // 首屏可见卡封面 + 已知手稿首页预热，减轻点开卡顿
  useEffect(() => {
    const top = rows.slice(0, 4);
    for (const row of top) {
      preloadRaster(coverPath(row));
      const id = row.source?.id || row.id;
      if (id === 'paul-first-journey' || id === 'exodus-wilderness') {
        preloadRaster(`/knowledge/infographics/${id}-comic.png`);
      }
    }
  }, [rows]);

  useEffect(() => {
    return scheduleIdle(() => {
      void adminCheck().then(setIsAdmin).catch(() => setIsAdmin(false));
    });
  }, []);

  const visible = useMemo(() => {
    if (filter === 'all') return rows;
    if (filter === 'note') return rows.filter(isNoteRow);
    return rows.filter((r) => !isNoteRow(r));
  }, [rows, filter]);

  const onUnpublish = async (row: KnowledgeLayoutSummary) => {
    const id = row.id || '';
    if (!isNoteRow(row) || !id) return;
    if (!window.confirm(`下架「${row.title || id}」？列表将不再显示。`)) return;
    setBusyId(id);
    try {
      await deleteKnowledgeNote(id);
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '下架失败');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main
      className={`container knowledge-topics-page${softReturn ? ' is-soft-return' : ''}`}
    >
      <header className="page-head knowledge-topics-head">
        <PageBackBar onClick={goBack} label="首页" />
        <h2 className="page-head-title">探索</h2>
        {isAdmin ? (
          <div className="page-head-actions">
            <Link
              href="/knowledge/new"
              className="icon-btn knowledge-topics-new"
              aria-label="新建手稿"
              title="新建"
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.25"
                strokeLinecap="round"
                aria-hidden
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            </Link>
          </div>
        ) : (
          <span className="knowledge-topics-new-spacer" aria-hidden />
        )}
      </header>
      <p className="knowledge-topics-lead">点开即读</p>

      <div className="knowledge-topics-filters" role="tablist" aria-label="筛选">
        {(
          [
            ['all', '全部'],
            ['journey', '行程'],
            ['note', '笔记'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={filter === id}
            className={`knowledge-topics-filter${filter === id ? ' is-on' : ''}`}
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="muted knowledge-topics-empty">
          {rows.length === 0 ? '暂无专题，稍后再来看看。' : '此分类暂无内容。'}
        </p>
      ) : (
        <div
          className={`knowledge-topics-grid${softReturn ? ' is-expand-return' : ''}`}
        >
          {visible.map((row, i) => {
            const sourceId = row.source?.id || row.id;
            const meta = resolveKnowledgeTopicMeta(row);
            const mediaBadge = knowledgeMediaBadge(meta.media);
            const note = isNoteRow(row);
            const cover = knowledgeRasterSources(coverPath(row));
            const stagger = Math.min(i, 5);
            const href = knowledgeLayoutViewHref(row);
            return (
              <div key={row.id} className="knowledge-topic-card-wrap">
                <Link
                  href={href}
                  prefetch
                  className="knowledge-topic-card"
                  aria-label={`${row.title || row.id}，打开手稿`}
                  style={{ ['--stagger' as string]: stagger }}
                  onClick={(e) => {
                    startKnowledgeExpand({
                      el: e.currentTarget,
                      cover: coverPath(row),
                      href,
                      topicId: sourceId,
                    });
                    preloadRaster(coverPath(row));
                  }}
                >
                  <span className="knowledge-topic-card-media" aria-hidden>
                    <picture>
                      {cover.webp ? (
                        <source type="image/webp" srcSet={cover.webp} />
                      ) : null}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        className="knowledge-topic-card-photo"
                        src={cover.fallback}
                        alt=""
                        loading={i < 4 ? 'eager' : 'lazy'}
                        decoding="async"
                        fetchPriority={i < 2 ? 'high' : 'auto'}
                      />
                    </picture>
                    <span className="knowledge-topic-card-veil" />
                    <span className="knowledge-topic-card-seal">
                      {knowledgeKindLabel(meta.kind)}
                    </span>
                    {mediaBadge ? (
                      <span className="knowledge-topic-card-media-badge">{mediaBadge}</span>
                    ) : null}
                    {row.beat_count ? (
                      <span className="knowledge-topic-card-count">{row.beat_count} 页</span>
                    ) : null}
                    <span className="knowledge-topic-card-caption">
                      <strong className="knowledge-topic-card-title">
                        {shortTitle(row.title || row.id || '')}
                      </strong>
                      {row.guide_one_liner ? (
                        <span className="knowledge-topic-card-guide">
                          {shortHook(row.guide_one_liner)}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </Link>
                {isAdmin && note ? (
                  <button
                    type="button"
                    className="knowledge-topic-card-unpub"
                    disabled={busyId === row.id}
                    onClick={() => void onUnpublish(row)}
                  >
                    {busyId === row.id ? '…' : '下架'}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
