'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, type BibleSearchHit, type TopicEntry } from '@/lib/api';
import { bibleSearch } from '@/lib/bible_client';
import { listNotes, type LocalNote } from '@/lib/notes';
import { navigateToAssistant } from '@/lib/assistant_prefill';
import { formatGroupRefLabel } from '@/lib/ref_label';
import { LIFE_TOPICS, matchLifeTopics } from '@/lib/discover_topics';
import { loadDailyThemes } from '@/lib/daily_themes';
import { mergeDiscoverTopics, isLifeTopic, topicColor } from '@/lib/topics_display';
import { refSpaceToOsis } from '@/lib/inline_ref';
import { readerHrefFromRef } from '@/lib/group_footprint';

const HISTORY_KEY = 'search_history';

type TopicVerseHit = {
  topic: string;
  ref: string;
  text: string;
  osis: string;
};

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

function normalizeRef(raw: string): string {
  const s = String(raw || '').trim();
  if (!s) return s;
  return s.includes('.') ? s : refSpaceToOsis(s.replace(/\./g, ' '));
}

export default function SearchPage() {
  const router = useRouter();
  const [backHref, setBackHref] = useState('/reader');
  const [query, setQuery] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [hits, setHits] = useState<BibleSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notes, setNotes] = useState<LocalNote[]>([]);
  const [lifeTopics, setLifeTopics] = useState(() => mergeDiscoverTopics([]));
  const [apiTopics, setApiTopics] = useState<TopicEntry[]>([]);
  const [dailyThemes, setDailyThemes] = useState<string[]>([]);
  const [topicVerses, setTopicVerses] = useState<TopicVerseHit[]>([]);
  const [topicLoading, setTopicLoading] = useState(false);

  useEffect(() => {
    setHistory(loadHistory());
    setNotes(listNotes());
    const params = new URLSearchParams(window.location.search);
    const from = params.get('from');
    if (from) setBackHref(from);
    const q = (params.get('q') || '').trim();
    if (q) {
      setQuery(q);
      const next = saveHistory(q);
      if (next) setHistory(next);
    }
    void api.topics().then((d) => {
      const list = 'topics' in d ? (d.topics ?? []) : [];
      setApiTopics(list);
      setLifeTopics(mergeDiscoverTopics(list));
    }).catch(() => {});
    void loadDailyThemes().then((d) => setDailyThemes(d.themes));
  }, []);

  const noteHits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (searchTooShort(q)) return [];
    return notes
      .filter(
        (n) =>
          n.body.toLowerCase().includes(q) ||
          (n.ref || '').toLowerCase().includes(q),
      )
      .slice(0, 10);
  }, [notes, query]);

  const filteredLifeTopics = useMemo(() => {
    const q = query.trim();
    if (!q) return lifeTopics;
    return lifeTopics.filter((t) => {
      const title = isLifeTopic(t) ? t.title : t.name;
      const sub = isLifeTopic(t) ? t.subtitle : '';
      return title.includes(q) || sub.includes(q);
    });
  }, [lifeTopics, query]);

  const filteredDailyThemes = useMemo(() => {
    const q = query.trim();
    if (!q) return dailyThemes;
    return dailyThemes.filter((t) => t.includes(q));
  }, [dailyThemes, query]);

  // 经文全文搜索
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
    bibleSearch(q)
      .then((rows) => {
        if (!cancelled) setHits(rows);
      })
      .catch((e) => {
        if (!cancelled) setErr(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  // 关键词自动匹配主题经文
  useEffect(() => {
    const q = query.trim();
    if (searchTooShort(q)) {
      setTopicVerses([]);
      return;
    }

    const matched = new Map<string, string>(); // title -> api key
    for (const t of matchLifeTopics(q)) {
      matched.set(t.title, t.title);
    }
    for (const t of apiTopics) {
      const name = t.name || t.id;
      if (name.includes(q) || t.id.includes(q)) {
        matched.set(name, name);
      }
    }
    for (const theme of dailyThemes) {
      if (theme.includes(q)) matched.set(theme, theme);
    }

    if (matched.size === 0) {
      setTopicVerses([]);
      return;
    }

    let cancelled = false;
    setTopicLoading(true);

    void (async () => {
      const out: TopicVerseHit[] = [];
      const seenRef = new Set<string>();

      // 人生主题静态经文优先
      for (const t of matchLifeTopics(q)) {
        for (const v of t.verses) {
          const osis = normalizeRef(v.ref);
          if (seenRef.has(osis)) continue;
          seenRef.add(osis);
          out.push({
            topic: t.title,
            ref: v.ref,
            text: v.text,
            osis,
          });
        }
      }

      // API 主题经文（含经文主题）
      const keys = Array.from(matched.values()).slice(0, 6);
      await Promise.all(
        keys.map(async (key) => {
          try {
            const d = await api.topics(key);
            if (!d || typeof d !== 'object' || !('refs' in d)) return;
            const entry = d as TopicEntry & {
              refs?: Array<string | { ref: string; text?: string }>;
            };
            const topicName = entry.name || key;
            for (const r of (entry.refs ?? []).slice(0, 8)) {
              const raw = typeof r === 'string' ? r : r.ref;
              const text = typeof r === 'string' ? '' : (r.text || '');
              const osis = normalizeRef(raw);
              if (!osis || seenRef.has(osis)) continue;
              seenRef.add(osis);
              out.push({
                topic: topicName,
                ref: raw,
                text: text.trim() || '（点击阅读）',
                osis,
              });
            }
          } catch {
            /* 单主题失败不影响其它 */
          }
        }),
      );

      if (!cancelled) {
        setTopicVerses(out.slice(0, 24));
        setTopicLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [query, apiTopics, dailyThemes]);

  const onSubmit = (q: string) => {
    const next = saveHistory(q);
    if (next) setHistory(next);
  };

  const applyTopicQuery = (name: string) => {
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

  const openTopicVerse = (v: TopicVerseHit) => {
    onSubmit(query);
    const href = readerHrefFromRef(v.ref) || readerHrefFromRef(v.osis);
    if (href) window.location.href = href;
  };

  const hasQuery = !searchTooShort(query.trim());

  return (
    <main className="container">
      <header style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <button
          type="button"
          className="icon-btn"
          aria-label="返回"
          onClick={() => {
            if (backHref.startsWith('/')) router.push(backHref);
            else router.back();
          }}
        >
          ←
        </button>
        <h2 style={{ margin: 0, fontSize: 'var(--app-heading-size, 18px)' }}>搜索</h2>
      </header>

      <input
        className="search-input"
        autoFocus
        placeholder="搜索经文、主题、人生话题…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit(query);
        }}
      />

      <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        点选下方主题即可匹配经文；也可直接输入关键词
      </p>

      {history.length > 0 && (
        <div className="chip-row" style={{ marginTop: 12 }}>
          {history.map((h) => (
            <button
              key={h}
              type="button"
              className="book-chip"
              style={{ width: 'auto' }}
              onClick={() => applyTopicQuery(h)}
            >
              {h}
            </button>
          ))}
        </div>
      )}

      {hasQuery && topicVerses.length > 0 && (
        <section style={{ marginTop: 18 }}>
          <h3 className="search-section-title">
            主题经文{topicLoading ? '…' : ` · ${topicVerses.length}`}
          </h3>
          {topicVerses.map((v) => (
            <div
              key={`${v.topic}-${v.osis}`}
              className="card card-2"
              style={{ marginBottom: 8, padding: 14, cursor: 'pointer' }}
              onClick={() => openTopicVerse(v)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontWeight: 700, color: 'var(--accent-deep)' }}>
                  {formatGroupRefLabel(v.ref) ?? v.ref}
                </span>
                <span className="muted" style={{ fontSize: 12 }}>{v.topic}</span>
              </div>
              <p style={{ margin: '6px 0 0', lineHeight: 1.55, color: 'var(--ink-soft)' }}>
                {v.text}
              </p>
            </div>
          ))}
        </section>
      )}

      {hasQuery && (
        <section style={{ marginTop: 18 }}>
          <h3 className="search-section-title">经文</h3>
          {loading && <p className="muted">搜索中…</p>}
          {err && <p className="muted">搜索失败：{err}</p>}
          {!loading && !err && hits.length === 0 && topicVerses.length === 0 && (
            <p className="muted">未找到匹配经文</p>
          )}
          {hits.map((h) => (
            <div
              key={h.osis}
              className="card card-2"
              style={{ marginBottom: 8, padding: 14, cursor: 'pointer' }}
              onClick={() => openReader(h)}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <span style={{ fontWeight: 700, color: 'var(--accent-deep)' }}>
                  {formatGroupRefLabel(h.ref)}
                </span>
                {h.version && h.version !== 'cnv' && (
                  <span className="version-badge">{h.version.toUpperCase()}</span>
                )}
              </div>
              <p style={{ margin: '6px 0 8px', lineHeight: 1.55, color: 'var(--ink-soft)' }}>
                {h.text}
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

      {hasQuery && noteHits.length > 0 && (
        <section style={{ marginTop: 18 }}>
          <h3 className="search-section-title">笔记 · {noteHits.length}</h3>
          {noteHits.map((n) => (
            <div
              key={n.id}
              className="card card-2"
              style={{ marginBottom: 8, padding: 14 }}
            >
              {n.ref && (
                <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--gold, #b8860b)' }}>
                  {formatGroupRefLabel(n.ref)}
                </span>
              )}
              <p style={{ margin: n.ref ? '6px 0 0' : 0, lineHeight: 1.55 }}>
                {n.body}
              </p>
            </div>
          ))}
        </section>
      )}

      {(query.trim().length === 0 || filteredLifeTopics.length > 0) && (
        <section style={{ marginTop: 18 }}>
          <h3 className="search-section-title">人生主题</h3>
          <div className="theme-grid">
            {filteredLifeTopics.map((t, i) => {
              const title = isLifeTopic(t) ? t.title : (t as TopicEntry).name;
              const color = isLifeTopic(t)
                ? t.color
                : (t as TopicEntry & { color?: string }).color || topicColor(i);
              return (
                <button
                  key={title}
                  type="button"
                  className="card card-2 theme-chip search-topic-chip"
                  style={{ borderLeft: `3px solid ${color}`, textAlign: 'left' }}
                  onClick={() => applyTopicQuery(title)}
                >
                  {title}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {(query.trim().length === 0 || filteredDailyThemes.length > 0) && dailyThemes.length > 0 && (
        <section style={{ marginTop: 18 }}>
          <h3 className="search-section-title">经文主题</h3>
          <div className="chip-row">
            {filteredDailyThemes.map((t) => (
              <button
                key={t}
                type="button"
                className="book-chip"
                style={{ width: 'auto' }}
                onClick={() => applyTopicQuery(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </section>
      )}

      {query.trim().length === 0 && (
        <>
          <section style={{ marginTop: 18 }}>
            <h3 className="search-section-title">热门关键词</h3>
            <div className="theme-grid">
              {LIFE_TOPICS.slice(0, 8).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="card card-2 theme-chip"
                  onClick={() => applyTopicQuery(t.title)}
                >
                  {t.title}
                </button>
              ))}
            </div>
          </section>

          <section style={{ marginTop: 18 }}>
            <h3 className="search-section-title">圣经背景专题</h3>
            <Link href="/discover/background" className="card card-2" style={{ display: 'block', padding: 14 }}>
              <strong>地图 · 时间线</strong>
              <p className="muted" style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.5 }}>
                保罗宣教旅程、耶稣事工路线、犹大诸王与耶稣生平时间线
              </p>
            </Link>
          </section>
        </>
      )}
    </main>
  );
}
