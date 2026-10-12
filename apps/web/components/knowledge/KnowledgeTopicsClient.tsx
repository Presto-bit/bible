'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import PageBackBar from '@/components/PageBackBar';
import { useFlowBack } from '@/lib/use_edge_swipe_back';
import { api, type KnowledgeLayoutSummary } from '@/lib/api';
import { knowledgeRasterSources } from '@/lib/knowledge_media_url';
import { knowledgeLayoutViewHref } from '@/lib/topic_routes';
import {
  consumeKnowledgeSoftReturn,
  getKnowledgeExpandSession,
  refreshKnowledgeLeaveOrigin,
  startKnowledgeExpand,
  subscribeKnowledgeExpand,
} from '@/lib/knowledge_nav';
import {
  knowledgeKindLabel,
  knowledgeMediaBadge,
  resolveKnowledgeTopicMeta,
} from '@/lib/knowledge_topic_meta';
import { adminCheck } from '@/lib/admin_rag';
import {
  isJourneyManuscriptId,
  journeyListCover,
  journeyManuscriptCover,
} from '@/lib/journey_covers';
import { prefetchKnowledgeDetail } from '@/lib/knowledge_detail_cache';
import '@/styles/discover_hub.css';

function coverPath(row: KnowledgeLayoutSummary): string {
  const id = row.id || '';
  return journeyListCover(id, row.cover_image);
}

function preloadRaster(path: string) {
  if (typeof window === 'undefined') return;
  const { webp, fallback } = knowledgeRasterSources(path);
  const primary = webp || fallback;
  const img = new Image();
  img.decoding = 'async';
  img.src = primary;
  if (webp && primary === webp) {
    img.onerror = () => {
      const fb = new Image();
      fb.decoding = 'async';
      fb.src = fallback;
    };
  }
}

function topicSourceId(row: KnowledgeLayoutSummary): string {
  return (row.source?.id || row.id || '').trim();
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

const EMPTY_LAYOUTS: KnowledgeLayoutSummary[] = [];

function sortLayouts(list: KnowledgeLayoutSummary[]) {
  return [...list].sort((a, b) => {
    const ta = Date.parse(a.generated_at || '') || 0;
    const tb = Date.parse(b.generated_at || '') || 0;
    if (tb !== ta) return tb - ta;
    return (a.title || a.id || '').localeCompare(b.title || b.id || '', 'zh');
  });
}

type Props = {
  initialLayouts?: KnowledgeLayoutSummary[];
  /** 嵌入发现壳：无返回/大标题；管理在筛选行；+ 底中 FAB */
  discoverEmbed?: boolean;
  paneActive?: boolean;
};

/**
 * 探索列表：1 行 2 卡封面流（点进直达全屏），对齐已拍板方案。
 */
export function KnowledgeTopicsClient({
  initialLayouts = EMPTY_LAYOUTS,
  discoverEmbed = false,
  paneActive = true,
}: Props) {
  const goBack = useFlowBack(discoverEmbed ? '/discover' : '/');
  const [rows, setRows] = useState(() =>
    initialLayouts.length ? sortLayouts(initialLayouts) : EMPTY_LAYOUTS,
  );
  const [filter, setFilter] = useState<FilterId>('all');
  const [isAdmin, setIsAdmin] = useState(false);
  const [softReturn, setSoftReturn] = useState(false);
  const [collapseTopicId, setCollapseTopicId] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(initialLayouts.length === 0);

  useEffect(() => {
    // 仅当父级真正传入非空预取时同步；避免默认 [] 每渲新引用把已拉结果清空
    if (initialLayouts.length > 0) {
      setRows(sortLayouts(initialLayouts));
      setLoading(false);
    }
  }, [initialLayouts]);

  useEffect(() => {
    if (!paneActive) return;
    if (initialLayouts.length > 0) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const res = await api.knowledgeLayouts();
        if (cancelled) return;
        const list = Array.isArray(res.layouts) ? res.layouts : [];
        setRows(sortLayouts(list));
        setLoadErr(null);
      } catch {
        if (!cancelled) setLoadErr('专题加载失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [paneActive, initialLayouts.length]);

  useEffect(() => {
    const soft = consumeKnowledgeSoftReturn();
    if (!soft) return;
    const sess = getKnowledgeExpandSession();
    setCollapseTopicId(sess?.topicId || null);
    setSoftReturn(true);
    // 列表已可见：重算缩回矩形，避免 keep-alive 隐藏时原点错位
    const raf = window.requestAnimationFrame(() => {
      refreshKnowledgeLeaveOrigin();
    });
    const unsub = subscribeKnowledgeExpand(() => {
      const s = getKnowledgeExpandSession();
      if (s?.phase === 'leave' && s.topicId) setCollapseTopicId(s.topicId);
      if (!s) {
        setSoftReturn(false);
        setCollapseTopicId(null);
      }
    });
    // 与 Host leave（约 130+340ms）对齐；会话结束时订阅会提前清
    const t = window.setTimeout(() => {
      setSoftReturn(false);
      setCollapseTopicId(null);
    }, 520);
    return () => {
      window.cancelAnimationFrame(raf);
      unsub();
      window.clearTimeout(t);
    };
  }, []);

  // 首屏可见卡：封面 + 手稿首页图 + 详情 JSON 预取
  useEffect(() => {
    const top = rows.slice(0, 4);
    for (const row of top) {
      preloadRaster(coverPath(row));
      const id = topicSourceId(row);
      if (id && isJourneyManuscriptId(id)) {
        preloadRaster(journeyManuscriptCover(id));
      }
    }
  }, [rows]);

  useEffect(() => {
    if (!paneActive || rows.length === 0) return;
    return scheduleIdle(() => {
      for (const row of rows.slice(0, 4)) {
        const id = topicSourceId(row);
        if (id) void prefetchKnowledgeDetail(id);
      }
    }, 1200);
  }, [paneActive, rows]);

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

  const Root = discoverEmbed ? 'div' : 'main';
  const filters = (
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
  );

  return (
    <Root
      className={`${discoverEmbed ? '' : 'container '}knowledge-topics-page${discoverEmbed ? ' is-discover-embed' : ''}${softReturn ? ' is-soft-return' : ''}`}
    >
      {!discoverEmbed ? (
        <>
          <header className="page-head knowledge-topics-head">
            <PageBackBar onClick={goBack} label="首页" />
            <h2 className="page-head-title">探索</h2>
            {isAdmin ? (
              <div className="page-head-actions knowledge-topics-admin-actions">
                <Link
                  href="/knowledge/manage"
                  className="knowledge-topics-manage"
                  aria-label="管理专题"
                >
                  管理
                </Link>
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
          {filters}
        </>
      ) : (
        <div className="knowledge-topics-embed-tools">
          {filters}
          {isAdmin ? (
            <div className="knowledge-topics-embed-admin">
              <Link href="/knowledge/manage" className="knowledge-topics-embed-manage">
                管理
              </Link>
              <Link
                href="/knowledge/new"
                className="knowledge-topics-embed-new"
                aria-label="新建手稿"
                title="新建"
              >
                +
              </Link>
            </div>
          ) : null}
        </div>
      )}

      {loadErr ? <p className="muted knowledge-topics-empty">{loadErr}</p> : null}

      {loading && rows.length === 0 ? (
        <p className="muted knowledge-topics-empty">加载专题…</p>
      ) : null}

      {visible.length === 0 && !loadErr && !loading ? (
        <p className="muted knowledge-topics-empty">
          {rows.length === 0 ? '暂无专题，稍后再来看看。' : '此分类暂无内容。'}
        </p>
      ) : visible.length === 0 ? null : (
        <div
          className={`knowledge-topics-grid${softReturn ? ' is-expand-return' : ''}`}
          data-collapse-topic={collapseTopicId || undefined}
        >
          {visible.map((row, i) => {
            const sourceId = topicSourceId(row);
            const meta = resolveKnowledgeTopicMeta(row);
            const mediaBadge = knowledgeMediaBadge(meta.media);
            const cover = knowledgeRasterSources(coverPath(row));
            const stagger = Math.min(i, 5);
            const href = knowledgeLayoutViewHref(row);
            const warmTopic = () => {
              if (!sourceId) return;
              void prefetchKnowledgeDetail(sourceId);
              const cover =
                sourceId && isJourneyManuscriptId(sourceId)
                  ? journeyManuscriptCover(sourceId)
                  : coverPath(row);
              preloadRaster(cover);
              // 按下即高优 preload 首图，抢在导航前占连接
              const { webp, fallback } = knowledgeRasterSources(cover);
              const href = webp || fallback;
              if (href && !document.getElementById(`kx-card-${sourceId}`)) {
                const link = document.createElement('link');
                link.id = `kx-card-${sourceId}`;
                link.rel = 'preload';
                link.as = 'image';
                link.href = href;
                link.setAttribute('fetchpriority', 'high');
                document.head.appendChild(link);
              }
            };
            return (
              <div key={row.id} className="knowledge-topic-card-wrap">
                <Link
                  href={href}
                  prefetch
                  className={`knowledge-topic-card${
                    collapseTopicId && collapseTopicId === sourceId
                      ? ' is-collapse-target'
                      : ''
                  }`}
                  data-knowledge-topic={sourceId || row.id}
                  aria-label={`${row.title || row.id}，打开手稿`}
                  style={{ ['--stagger' as string]: stagger }}
                  onPointerEnter={warmTopic}
                  onPointerDown={warmTopic}
                  onFocus={warmTopic}
                  onClick={(e) => {
                    const manuscriptCover =
                      sourceId && isJourneyManuscriptId(sourceId)
                        ? journeyManuscriptCover(sourceId)
                        : coverPath(row);
                    startKnowledgeExpand({
                      el: e.currentTarget,
                      cover: manuscriptCover,
                      href,
                      topicId: sourceId,
                    });
                    preloadRaster(manuscriptCover);
                    warmTopic();
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
              </div>
            );
          })}
        </div>
      )}
    </Root>
  );
}
