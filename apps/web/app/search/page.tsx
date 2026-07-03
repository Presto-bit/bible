'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, type BibleSearchHit, type TopicEntry } from '@/lib/api';
import { bibleSearch } from '@/lib/bible_client';
import { listNotes, type LocalNote } from '@/lib/notes';
import { navigateToAssistant } from '@/lib/assistant_prefill';
import { formatGroupRefLabel } from '@/lib/ref_label';
import { LIFE_TOPICS } from '@/lib/discover_topics';
import { loadDailyThemes } from '@/lib/daily_themes';
import { mergeDiscoverTopics, isLifeTopic } from '@/lib/topics_display';

const HISTORY_KEY = 'search_history';

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
  const [dailyThemes, setDailyThemes] = useState<string[]>([]);

  useEffect(() => {
    setHistory(loadHistory());
    setNotes(listNotes());
    const from = new URLSearchParams(window.location.search).get('from');
    if (from) setBackHref(from);
    void api.topics().then((d) => {
      const list = 'topics' in d ? d.topics : [];
      setLifeTopics(mergeDiscoverTopics(list ?? []));
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
    const q = query.trim().toLowerCase();
    if (!q) return lifeTopics;
    return lifeTopics.filter((t) => {
      const title = isLifeTopic(t) ? t.title : t.name;
      const sub = isLifeTopic(t) ? t.subtitle : '';
      return title.toLowerCase().includes(q) || sub.toLowerCase().includes(q);
    });
  }, [lifeTopics, query]);

  const filteredDailyThemes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return dailyThemes;
    return dailyThemes.filter((t) => t.toLowerCase().includes(q));
  }, [dailyThemes, query]);

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

  const onSubmit = (q: string) => {
    const next = saveHistory(q);
    if (next) setHistory(next);
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

  const topicHref = (t: typeof lifeTopics[0]) => {
    const id = isLifeTopic(t) ? t.id : (t as TopicEntry).id || (t as TopicEntry).name;
    return `/discover/topic/${encodeURIComponent(id)}`;
  };

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
        高级语法： &quot;整段精确&quot; · 书卷:约翰福音 · -排除词
      </p>

      {history.length > 0 && (
        <div className="chip-row" style={{ marginTop: 12 }}>
          {history.map((h) => (
            <button
              key={h}
              type="button"
              className="book-chip"
              style={{ width: 'auto' }}
              onClick={() => {
                setQuery(h);
                onSubmit(h);
              }}
            >
              {h}
            </button>
          ))}
        </div>
      )}

      {!searchTooShort(query.trim()) && (
        <section style={{ marginTop: 18 }}>
          <h3 className="search-section-title">经文</h3>
          {loading && <p className="muted">搜索中…</p>}
          {err && <p className="muted">搜索失败：{err}</p>}
          {!loading && !err && hits.length === 0 && (
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

      {!searchTooShort(query.trim()) && noteHits.length > 0 && (
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
            {filteredLifeTopics.map((t) => {
              const title = isLifeTopic(t) ? t.title : (t as TopicEntry).name;
              const color = isLifeTopic(t) ? t.color : (t as TopicEntry & { color: string }).color;
              return (
                <Link
                  key={title}
                  href={topicHref(t)}
                  className="card card-2 theme-chip search-topic-chip"
                  style={{ borderLeft: `3px solid ${color}` }}
                >
                  {title}
                </Link>
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
              <Link
                key={t}
                href={`/discover/topic/${encodeURIComponent(t)}`}
                className="book-chip"
                style={{ width: 'auto' }}
              >
                {t}
              </Link>
            ))}
          </div>
        </section>
      )}

      {query.trim().length === 0 && (
        <section style={{ marginTop: 18 }}>
          <h3 className="search-section-title">热门关键词</h3>
          <div className="theme-grid">
            {LIFE_TOPICS.slice(0, 8).map((t) => (
              <button
                key={t.id}
                type="button"
                className="card card-2 theme-chip"
                onClick={() => {
                  setQuery(t.title);
                  onSubmit(t.title);
                }}
              >
                {t.title}
              </button>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
