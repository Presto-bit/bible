'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, type BibleSearchHit } from '@/lib/api';
import { listNotes, type LocalNote } from '@/lib/notes';
import { navigateToAssistant } from '@/lib/assistant_prefill';

const THEME_TAGS = ['盼望', '焦虑', '祷告', '家庭', '工作', '悲伤', '信心', '宽恕'];
const HISTORY_KEY = 'search_history';

// 含中文时单字即可搜，纯拉丁词需至少 2 字符。
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

  useEffect(() => {
    setHistory(loadHistory());
    setNotes(listNotes());
    const from = new URLSearchParams(window.location.search).get('from');
    if (from) setBackHref(from);
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
    api
      .search(q)
      .then((d) => {
        if (!cancelled) setHits(d.hits);
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
        <h2 style={{ margin: 0, fontSize: 18 }}>搜索</h2>
      </header>

      <input
        className="search-input"
        autoFocus
        placeholder="搜索经文…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit(query);
        }}
      />

      <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
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
          <h3 style={{ fontSize: 14, margin: '0 0 8px' }}>经文</h3>
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
                <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--accent-deep)' }}>
                  {h.ref}
                </span>
                {h.version && h.version !== 'cnv' && (
                  <span className="version-badge">{h.version.toUpperCase()}</span>
                )}
              </div>
              <p style={{ margin: '6px 0 8px', fontSize: 13, lineHeight: 1.45, color: 'var(--ink-soft)' }}>
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
          <h3 style={{ fontSize: 14, margin: '0 0 8px' }}>笔记 · {noteHits.length}</h3>
          {noteHits.map((n) => (
            <div
              key={n.id}
              className="card card-2"
              style={{ marginBottom: 8, padding: 14 }}
            >
              {n.ref && (
                <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--gold, #b8860b)' }}>
                  {n.ref}
                </span>
              )}
              <p style={{ margin: n.ref ? '6px 0 0' : 0, fontSize: 13, lineHeight: 1.5 }}>
                {n.body}
              </p>
            </div>
          ))}
        </section>
      )}

      {query.trim().length === 0 && (
        <section style={{ marginTop: 18 }}>
          <h3 style={{ fontSize: 14, margin: '0 0 10px' }}>热门关键词</h3>
          <div className="theme-grid">
            {THEME_TAGS.map((t) => (
              <button
                key={t}
                type="button"
                className="card card-2 theme-chip"
                onClick={() => {
                  setQuery(t);
                  onSubmit(t);
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
