'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import PageBackBar from '@/components/PageBackBar';
import ErrorBanner, { errorMessage } from '@/components/ErrorBanner';
import { backLabelForHref, useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';
import { useRouter } from 'next/navigation';
import {
  api,
  type BibleSearchHit,
  type BibleVersion,
  type DictEntity,
  type MapTour,
  type TimelineTour,
} from '@/lib/api';
import { entityDisplayName, entityTypeLabel } from '@/lib/dictionary_match';
import { entityDictionaryHref } from '@/lib/entity_knowledge';
import { bibleSearch } from '@/lib/bible_client';
import { listAllThoughts } from '@/lib/reader_thoughts';
import { navigateToAssistant } from '@/lib/assistant_prefill';
import { formatGroupRefLabel } from '@/lib/ref_label';
import {
  diagramTourHref,
  graphTopicHref,
  mapStoryHref,
  SEARCH_HOT_KEYWORDS,
  timelineStoryHref,
} from '@/lib/topic_routes';
import { TopicNavCard } from '@/components/search/TopicNavCard';
import { getMainVersion } from '@/lib/reader_settings';
import { testament } from '@/lib/dictionary_match';

const HISTORY_KEY = 'search_history';

/** all = 默认全部；ot/nt = 仅前端筛选，不重搜 */
type ScopeTab = 'all' | 'ot' | 'nt';

function searchTooShort(q: string): boolean {
  const hasCjk = /[\u4e00-\u9fff]/.test(q);
  return q.length < (hasCjk ? 1 : 2);
}

function loadHistory(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') as string[];
  } catch {
    return [];
  }
}

function saveHistory(q: string) {
  const trimmed = q.trim();
  if (!trimmed) return;
  const prev = loadHistory();
  const next = [trimmed, ...prev.filter((h) => h !== trimmed)].slice(0, 20);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  return next;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 从查询串提取用于高亮的词（忽略高级语法符号）。 */
function highlightTerms(query: string): string[] {
  const raw = query
    .replace(/["""''「」]/g, ' ')
    .replace(/(?:书卷|book)\s*[:：]\s*\S+/gi, ' ')
    .replace(/(?:^|\s)-\S+/g, ' ')
    .trim();
  if (!raw) return [];
  const parts = raw.split(/\s+/).filter((t) => t.length > 0);
  return Array.from(new Set(parts));
}

function highlightText(text: string, query: string): ReactNode {
  const terms = highlightTerms(query);
  if (!terms.length || !text) return text;
  const re = new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'gi');
  const nodes: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const runner = new RegExp(re.source, 'gi');
  while ((m = runner.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    nodes.push(
      <mark key={`${m.index}-${m[0]}`} className="search-hit-mark">
        {m[0]}
      </mark>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes.length ? nodes : text;
}

function defaultSearchVersion(): string {
  return getMainVersion() || 'cnv';
}

export default function SearchPage() {
  const router = useRouter();
  const [backHref, setBackHref] = useState('/reader');

  const goBack = () => {
    if (backHref.startsWith('/')) router.push(backHref);
    else router.back();
  };

  useEdgeSwipeBack({
    href: backHref.startsWith('/') ? backHref : undefined,
    preferHistoryBack: !backHref.startsWith('/'),
  });

  const [query, setQuery] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [hits, setHits] = useState<BibleSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [thoughts, setThoughts] = useState<ReturnType<typeof listAllThoughts>>([]);
  const [mapTours, setMapTours] = useState<MapTour[]>([]);
  const [timelineTours, setTimelineTours] = useState<TimelineTour[]>([]);
  const [toursReady, setToursReady] = useState(false);
  const [scopeTab, setScopeTab] = useState<ScopeTab>('all');
  const [searchVersion, setSearchVersion] = useState('cnv');
  const [versions, setVersions] = useState<BibleVersion[]>([]);
  const [entityHits, setEntityHits] = useState<DictEntity[]>([]);
  const [entityLoading, setEntityLoading] = useState(false);
  const [searchRetry, setSearchRetry] = useState(0);

  useEffect(() => {
    setHistory(loadHistory());
    setThoughts(listAllThoughts());
    setSearchVersion(defaultSearchVersion());
    const params = new URLSearchParams(window.location.search);
    const from = params.get('from');
    if (from) setBackHref(from);
    const q = (params.get('q') || '').trim();
    if (q) {
      setQuery(q);
      const next = saveHistory(q);
      if (next) setHistory(next);
    }
    void Promise.all([
      api.mapTours().then((d) => setMapTours(d.tours ?? [])).catch(() => setMapTours([])),
      api.timelineTours().then((d) => setTimelineTours(d.tours ?? [])).catch(() => setTimelineTours([])),
      api.versions().then((d) => {
        const list = (d.versions ?? []).filter((v) => v.available !== false);
        setVersions(list.length ? list : [
          { id: 'cnv', label: '新译本', available: true, primary: true },
          { id: 'cuvs', label: '和合本', available: true, primary: false },
          { id: 'kjv', label: 'King James Version', available: true, primary: false },
        ]);
      }).catch(() => {
        setVersions([
          { id: 'cnv', label: '新译本', available: true, primary: true },
          { id: 'cuvs', label: '和合本', available: true, primary: false },
          { id: 'kjv', label: 'King James Version', available: true, primary: false },
        ]);
      }),
    ]).finally(() => setToursReady(true));
  }, []);

  const thoughtHits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (searchTooShort(q)) return [];
    return thoughts
      .filter(
        (t) =>
          t.body.toLowerCase().includes(q) ||
          (t.ref || '').toLowerCase().includes(q),
      )
      .slice(0, 10);
  }, [thoughts, query]);

  // 仅关键词 / 译本变化时重新搜索；新旧约只做前端筛选
  useEffect(() => {
    const q = query.trim();
    if (searchTooShort(q)) {
      setHits([]);
      setErr(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErr(null);
    bibleSearch(q, { version: searchVersion })
      .then((rows) => {
        if (!cancelled) setHits(rows);
      })
      .catch((e) => {
        if (!cancelled) setErr(errorMessage(e, '搜索失败'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query, searchVersion, searchRetry]);

  useEffect(() => {
    const q = query.trim();
    if (searchTooShort(q)) {
      setEntityHits([]);
      return;
    }
    let cancelled = false;
    setEntityLoading(true);
    void api
      .dictionary(q)
      .then((d) => {
        if (!cancelled) setEntityHits((d.entities ?? []).slice(0, 8));
      })
      .catch(() => {
        if (!cancelled) setEntityHits([]);
      })
      .finally(() => {
        if (!cancelled) setEntityLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  const displayHits = useMemo(() => {
    if (scopeTab === 'ot') return hits.filter((h) => testament(h.book) === 'OT');
    if (scopeTab === 'nt') return hits.filter((h) => testament(h.book) === 'NT');
    return hits;
  }, [hits, scopeTab]);

  const onSubmit = (q: string) => {
    const next = saveHistory(q);
    if (next) setHistory(next);
  };

  const applyHistoryQuery = (name: string) => {
    setQuery(name);
    onSubmit(name);
  };

  const openReader = (hit: BibleSearchHit) => {
    onSubmit(query);
    window.location.href = `/reader?book=${encodeURIComponent(hit.book)}&chapter=${hit.chapter}`;
  };

  const openAssistant = (hit: BibleSearchHit) => {
    onSubmit(query);
    const snippet = hit.text.length > 24 ? `${hit.text.slice(0, 24)}…` : hit.text;
    navigateToAssistant(hit.osis, { question: `请解释：${snippet}` });
  };

  const hasQuery = !searchTooShort(query.trim());
  const versionLabel =
    versions.find((v) => v.id === searchVersion)?.label
    || searchVersion.toUpperCase();

  return (
    <main className="container">
      <header className="page-head">
        <PageBackBar
          onClick={goBack}
          label={backLabelForHref(backHref)}
        />
        <h2 className="page-head-title">搜索</h2>
      </header>

      <input
        className="search-input"
        autoFocus
        placeholder="搜索经文、笔记…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit(query);
        }}
      />

      {history.length > 0 && (
        <div className="chip-row" style={{ marginTop: 12 }}>
          {history.map((h) => (
            <button
              key={h}
              type="button"
              className="book-chip"
              style={{ width: 'auto' }}
              onClick={() => applyHistoryQuery(h)}
            >
              {h}
            </button>
          ))}
        </div>
      )}

      {!hasQuery && (
        <section className="story-card-rail" style={{ marginTop: 14 }}>
          <div className="section-row" style={{ marginBottom: 8 }}>
            <span>专题</span>
          </div>
          <div className="story-entry-scroll rail">
            <TopicNavCard
              href={mapStoryHref(mapTours[0]?.id)}
              className="rail-card card card-2 story-tour-card story-entry-card"
              ariaLabel={mapTours[0]?.title ?? '地图故事'}
            >
              <span className="story-tour-badge">地图故事</span>
              <strong className="story-tour-title">{mapTours[0]?.title ?? '圣经地理路线'}</strong>
              <p className="muted story-tour-meta">
                {toursReady
                  ? (mapTours[0]
                    ? `${mapTours[0].stops?.length ?? 0} 站 · 点击开始`
                    : '暂无专题')
                  : '加载中…'}
              </p>
              <span className="story-tour-toggle">开始游览 ›</span>
            </TopicNavCard>

            <TopicNavCard
              href={diagramTourHref()}
              className="rail-card card card-2 story-tour-card story-entry-card"
              ariaLabel="会幕平面图"
            >
              <span className="story-tour-badge story-tour-badge-diagram">图鉴馆</span>
              <strong className="story-tour-title">会幕平面图</strong>
              <p className="muted story-tour-meta">引导式热区 · 4 处起</p>
              <span className="story-tour-toggle">开始游览 ›</span>
            </TopicNavCard>

            <TopicNavCard
              href={graphTopicHref()}
              className="rail-card card card-2 story-tour-card story-entry-card"
              ariaLabel="出埃及核心人物"
            >
              <span className="story-tour-badge story-tour-badge-graph">关系专题</span>
              <strong className="story-tour-title">出埃及核心人物</strong>
              <p className="muted story-tour-meta">人物关系 · 附经文</p>
              <span className="story-tour-toggle">查看专题 ›</span>
            </TopicNavCard>

            <TopicNavCard
              href={timelineStoryHref(timelineTours[0]?.id)}
              className="rail-card card card-2 story-tour-card story-entry-card"
              ariaLabel={timelineTours[0]?.title ?? '时间线专题'}
            >
              <span className="story-tour-badge story-tour-badge-time">时间故事</span>
              <strong className="story-tour-title">{timelineTours[0]?.title ?? '时间线专题'}</strong>
              <p className="muted story-tour-meta">
                {toursReady
                  ? (timelineTours[0]
                    ? `${timelineTours[0].events?.length ?? 0} 个节点 · 点击开始`
                    : '暂无专题')
                  : '加载中…'}
              </p>
              <span className="story-tour-toggle">开始游览 ›</span>
            </TopicNavCard>
          </div>
        </section>
      )}

      {hasQuery && (
        <section style={{ marginTop: 18 }}>
          {(entityLoading || entityHits.length > 0) && (
            <>
              <h3 className="search-section-title">人物与地点</h3>
              {entityLoading ? (
                <p className="muted" style={{ fontSize: 13 }}>查找词条…</p>
              ) : (
                <div className="search-entity-list">
                  {entityHits.map((ent) => (
                    <Link
                      key={ent.id ?? ent.name}
                      href={entityDictionaryHref(ent)}
                      className="card card-2 search-entity-card"
                    >
                      <strong>{entityDisplayName(ent)}</strong>
                      {entityTypeLabel(ent.type) ? (
                        <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>
                          {entityTypeLabel(ent.type)}
                        </span>
                      ) : null}
                      <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
                        {(ent.summary || '').slice(0, 48)}{(ent.summary || '').length > 48 ? '…' : ''}
                      </p>
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}

          <div className="search-result-head" style={{ marginTop: entityHits.length ? 16 : 0 }}>
            <h3 className="search-section-title" style={{ margin: 0 }}>经文</h3>
            <div className="search-filter-tabs" role="tablist" aria-label="搜索范围">
              <button
                type="button"
                role="tab"
                aria-selected={scopeTab === 'ot'}
                className={`search-filter-tab${scopeTab === 'ot' ? ' is-active' : ''}`}
                onClick={() => setScopeTab((t) => (t === 'ot' ? 'all' : 'ot'))}
              >
                旧约
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={scopeTab === 'nt'}
                className={`search-filter-tab${scopeTab === 'nt' ? ' is-active' : ''}`}
                onClick={() => setScopeTab((t) => (t === 'nt' ? 'all' : 'nt'))}
              >
                新约
              </button>
              <label
                className={`search-filter-tab search-filter-version${scopeTab === 'all' ? ' is-active' : ''}`}
              >
                <span className="search-filter-version-btn">版本</span>
                <select
                  className="search-version-select"
                  value={searchVersion}
                  aria-label="选择译本"
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    setSearchVersion(e.target.value);
                    setScopeTab('all');
                  }}
                >
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label || v.id.toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <p className="muted search-filter-hint">
            {scopeTab === 'ot' ? '旧约 · ' : scopeTab === 'nt' ? '新约 · ' : '全部 · '}
            {versionLabel}
            {!loading && hits.length > 0 ? ` · ${displayHits.length}/${hits.length}` : ''}
          </p>
          {loading && <p className="muted">搜索中…</p>}
          {err && (
            <ErrorBanner
              message={err}
              onRetry={() => setSearchRetry((n) => n + 1)}
              onDismiss={() => setErr(null)}
            />
          )}
          {!loading && !err && displayHits.length === 0 && (
            <p className="muted">
              {hits.length > 0 ? '当前约别下无匹配经文' : '未找到匹配经文'}
            </p>
          )}
          {displayHits.map((h) => (
            <div
              key={`${h.osis}-${h.version}`}
              className="card card-2 search-hit-card"
              style={{ marginBottom: 8, padding: 14, cursor: 'pointer' }}
              onClick={() => openReader(h)}
            >
              <div className="search-hit-top">
                <span className="search-hit-ref">
                  {formatGroupRefLabel(h.ref)}
                </span>
                <span className="version-badge">
                  {(h.version || searchVersion).toUpperCase()}
                </span>
              </div>
              <p className="search-hit-text">
                {highlightText(h.text, query)}
              </p>
              <button
                type="button"
                className="text-link"
                onClick={(e) => {
                  e.stopPropagation();
                  openAssistant(h);
                }}
              >
                问小爱
              </button>
            </div>
          ))}
        </section>
      )}

      {hasQuery && thoughtHits.length > 0 && (
        <section style={{ marginTop: 18 }}>
          <h3 className="search-section-title">想法 · {thoughtHits.length}</h3>
          {thoughtHits.map((t) => (
            <div
              key={t.id}
              className="card card-2"
              style={{ marginBottom: 8, padding: 14 }}
            >
              {t.ref && (
                <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--gold, #b8860b)' }}>
                  {formatGroupRefLabel(t.ref)}
                </span>
              )}
              <p style={{ margin: t.ref ? '6px 0 0' : 0, lineHeight: 1.55 }}>
                {highlightText(t.body, query)}
              </p>
            </div>
          ))}
        </section>
      )}

      {query.trim().length === 0 && (
        <section style={{ marginTop: 18 }}>
          <h3 className="search-section-title">热门关键词</h3>
          <div className="theme-grid hot-keyword-grid">
            {SEARCH_HOT_KEYWORDS.map((kw) => (
              <button
                key={kw}
                type="button"
                className="theme-chip hot-keyword-chip"
                onClick={() => applyHistoryQuery(kw)}
              >
                {kw}
              </button>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
