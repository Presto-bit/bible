'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  createNote,
  listNotes,
  removeNote,
  updateNote,
  type LocalNote,
} from '@/lib/notes';
import { loadFavoriteRefs, toggleFavorite } from '@/lib/favorites';
import { api, currentUserId, type BibleBook } from '@/lib/api';
import { syncNow } from '@/lib/sync';
import { ShareToSocialSheet } from '@/components/ShareToSocialSheet';
import { listAllThoughts, type ThoughtRow } from '@/lib/reader_thoughts';
import { listHighlightRefs, removeHighlight, type HighlightMark } from '@/lib/reader_highlights';

interface Favorite {
  ref: string;
  bookId: string;
  chapter: number;
  verse?: number;
}

function loadFavorites(): Favorite[] {
  return loadFavoriteRefs().map((r) => {
    const [bookId, ch, v] = r.split('.');
    return { ref: r, bookId, chapter: Number(ch) || 1, verse: v ? Number(v) : undefined };
  });
}

type Tab = 'all' | 'notes' | 'thoughts' | 'favorites' | 'highlights';

type FeedItem =
  | { kind: 'note'; id: string; ref?: string | null; body: string; ts: number; note: LocalNote }
  | { kind: 'thought'; id: string; ref: string; body: string; ts: number }
  | { kind: 'favorite'; id: string; ref: string; label: string }
  | { kind: 'highlight'; id: string; ref: string; mark: HighlightMark };

const STYLE_LABEL: Record<HighlightMark['style'], string> = {
  color: '颜色',
  solid: '实线',
  dashed: '虚线',
};

export default function NotesPage() {
  const [tab, setTab] = useState<Tab>('all');
  const [query, setQuery] = useState('');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [notes, setNotes] = useState<LocalNote[]>([]);
  const [thoughts, setThoughts] = useState<ThoughtRow[]>([]);
  const [highlights, setHighlights] = useState<{ ref: string; mark: HighlightMark }[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [bookNames, setBookNames] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<LocalNote | null>(null);
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  const [shareTarget, setShareTarget] = useState<null | { ref: string; label: string; body: string }>(null);

  const refresh = () => {
    setNotes(listNotes());
    setThoughts(listAllThoughts());
    setHighlights(listHighlightRefs());
    setFavorites(loadFavorites());
  };

  useEffect(() => {
    refresh();
    api
      .books()
      .then((d) => {
        const map: Record<string, string> = {};
        d.books.forEach((b: BibleBook) => {
          map[b.id] = b.name;
        });
        setBookNames(map);
      })
      .catch(() => {});
    if (currentUserId()) {
      syncNow().then(() => refresh()).catch(() => {});
    }
  }, []);

  const openNew = () => {
    setEditing(null);
    setDraft('');
    setOpen(true);
  };

  const openEdit = (n: LocalNote) => {
    setEditing(n);
    setDraft(n.body);
    setOpen(true);
  };

  const save = () => {
    const body = draft.trim();
    if (!body) return;
    if (editing) updateNote(editing.id, body);
    else createNote(body);
    setOpen(false);
    refresh();
  };

  const del = (id: string) => {
    removeNote(id);
    refresh();
  };

  const removeFavorite = (ref: string) => {
    if (loadFavoriteRefs().includes(ref)) toggleFavorite(ref);
    refresh();
  };

  const removeHighlightItem = (ref: string) => {
    removeHighlight(ref);
    refresh();
  };

  const favLabel = (f: Favorite) => {
    const name = bookNames[f.bookId] || f.bookId;
    return `${name} ${f.chapter}${f.verse ? `:${f.verse}` : ''}`;
  };

  const refLabel = (ref: string) => {
    const [bookId, ch, tail] = ref.split('.');
    const name = bookNames[bookId] || bookId;
    if (!tail) return `${name} ${ch}`;
    return `${name} ${ch}:${tail.replace('-', '–')}`;
  };

  const allTags = useMemo(() => {
    const set = new Set<string>();
    notes.forEach((n) => n.tags?.forEach((t) => t && set.add(t)));
    return [...set].sort();
  }, [notes]);

  const feed = useMemo((): FeedItem[] => {
    const items: FeedItem[] = [
      ...notes.map((n) => ({
        kind: 'note' as const,
        id: n.id,
        ref: n.ref,
        body: n.body,
        ts: n.updatedAt,
        note: n,
      })),
      ...thoughts.map((t) => ({
        kind: 'thought' as const,
        id: t.id,
        ref: t.ref,
        body: t.body,
        ts: t.createdAtMs,
      })),
      ...favorites.map((f) => ({
        kind: 'favorite' as const,
        id: f.ref,
        ref: f.ref,
        label: favLabel(f),
      })),
      ...highlights.map((h) => ({
        kind: 'highlight' as const,
        id: h.ref,
        ref: h.ref,
        mark: h.mark,
      })),
    ];
    items.sort((a, b) => {
      const ta = 'ts' in a ? a.ts : 0;
      const tb = 'ts' in b ? b.ts : 0;
      return tb - ta;
    });
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, thoughts, favorites, highlights, bookNames]);

  const filteredFeed = useMemo(() => {
    const q = query.trim().toLowerCase();
    return feed.filter((item) => {
      if (tab === 'notes' && item.kind !== 'note') return false;
      if (tab === 'thoughts' && item.kind !== 'thought') return false;
      if (tab === 'favorites' && item.kind !== 'favorite') return false;
      if (tab === 'highlights' && item.kind !== 'highlight') return false;
      if (item.kind === 'note' && tab === 'notes' && tagFilter && !(item.note.tags || []).includes(tagFilter)) return false;
      if (!q) return true;
      if (item.kind === 'note') {
        return (
          item.body.toLowerCase().includes(q) ||
          (item.ref || '').toLowerCase().includes(q) ||
          (item.note.tags || []).some((t) => t.toLowerCase().includes(q))
        );
      }
      if (item.kind === 'thought') {
        return item.body.toLowerCase().includes(q) || item.ref.toLowerCase().includes(q);
      }
      if (item.kind === 'favorite') {
        return item.ref.toLowerCase().includes(q) || item.label.toLowerCase().includes(q);
      }
      return item.ref.toLowerCase().includes(q);
    });
  }, [feed, tab, query, tagFilter]);

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'all', label: '全部', count: feed.length },
    { id: 'notes', label: '笔记', count: notes.length },
    { id: 'thoughts', label: '想法', count: thoughts.length },
    { id: 'favorites', label: '收藏', count: favorites.length },
    { id: 'highlights', label: '划线', count: highlights.length },
  ];

  return (
    <main className="container">
      <header style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <a href="/profile" className="icon-btn" aria-label="返回">
          ←
        </a>
        <h2 style={{ margin: 0, fontSize: 18, flex: 1 }}>我的笔记</h2>
        <button type="button" className="font-pill" onClick={openNew}>
          + 新建
        </button>
      </header>

      <div className="search-bar" style={{ marginBottom: 12 }}>
        <input
          className="search-input"
          placeholder="搜索笔记、想法、收藏或划线…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {tab === 'notes' && allTags.length > 0 && (
        <div className="tag-filter-row" style={{ marginBottom: 12 }}>
          <button
            type="button"
            className={`pill ${tagFilter === null ? 'pill-active' : ''}`}
            onClick={() => setTagFilter(null)}
          >
            全部
          </button>
          {allTags.map((t) => (
            <button
              key={t}
              type="button"
              className={`pill ${tagFilter === t ? 'pill-active' : ''}`}
              onClick={() => setTagFilter(tagFilter === t ? null : t)}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      <div className="seg-tabs notes-seg-tabs" style={{ marginBottom: 12 }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`seg-tab ${tab === t.id ? 'seg-tab-active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}{t.count > 0 ? ` · ${t.count}` : ''}
          </button>
        ))}
      </div>

      {filteredFeed.length === 0 ? (
        <p className="muted" style={{ marginTop: 24, textAlign: 'center' }}>
          {query ? '没有匹配的内容。' : '还没有内容。阅读时可写想法、收藏经文或划线。'}
        </p>
      ) : (
        filteredFeed.map((item) => {
          if (item.kind === 'note') {
            return (
              <div key={`note-${item.id}`} className="card card-2" style={{ marginBottom: 10, padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span className="pill" style={{ fontSize: 10 }}>笔记</span>
                  {item.ref && (
                    <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--accent-deep)' }}>
                      {item.ref}
                    </span>
                  )}
                </div>
                <p style={{ margin: '6px 0 10px', lineHeight: 1.6 }}>{item.body}</p>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button type="button" className="text-link" onClick={() => openEdit(item.note)}>
                    编辑
                  </button>
                  {item.ref && (
                    <button
                      type="button"
                      className="text-link"
                      onClick={() => setShareTarget({ ref: item.ref!, label: item.ref!, body: item.body })}
                    >
                      分享
                    </button>
                  )}
                  <button type="button" className="text-link" style={{ color: '#b1554a' }} onClick={() => del(item.id)}>
                    删除
                  </button>
                </div>
              </div>
            );
          }
          if (item.kind === 'thought') {
            return (
              <div key={`thought-${item.id}`} className="card card-2" style={{ marginBottom: 10, padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span className="pill pill-active" style={{ fontSize: 10 }}>想法</span>
                  <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--accent-deep)' }}>
                    {refLabel(item.ref)}
                  </span>
                </div>
                <p style={{ margin: '6px 0 10px', lineHeight: 1.6 }}>{item.body}</p>
                <a className="text-link" href={`/reader?ref=${encodeURIComponent(item.ref)}`}>
                  阅读原文
                </a>
              </div>
            );
          }
          if (item.kind === 'favorite') {
            return (
              <div key={`fav-${item.id}`} className="card card-2" style={{ marginBottom: 10, padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="pill" style={{ fontSize: 10 }}>收藏</span>
                  <span style={{ fontWeight: 700, color: 'var(--accent-deep)', flex: 1 }}>
                    ★ {item.label}
                  </span>
                  <a className="text-link" href={`/reader?book=${item.ref.split('.')[0]}&chapter=${item.ref.split('.')[1]}`}>
                    阅读
                  </a>
                  <button
                    type="button"
                    className="text-link"
                    onClick={() => setShareTarget({ ref: item.ref, label: item.label, body: '' })}
                  >
                    分享
                  </button>
                  <button type="button" className="text-link" style={{ color: '#b1554a' }} onClick={() => removeFavorite(item.ref)}>
                    移除
                  </button>
                </div>
              </div>
            );
          }
          const [bookId, ch] = item.ref.split('.');
          return (
            <div key={`hl-${item.id}`} className="card card-2" style={{ marginBottom: 10, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="pill" style={{ fontSize: 10 }}>划线</span>
                <span className={`verse-mark verse-mark-${item.mark.style} verse-mark-${item.mark.color}`} style={{ fontSize: 12 }}>
                  {STYLE_LABEL[item.mark.style]}
                </span>
                <span style={{ fontWeight: 700, color: 'var(--accent-deep)', flex: 1 }}>
                  {refLabel(item.ref)}
                </span>
                <a className="text-link" href={`/reader?book=${bookId}&chapter=${ch}`}>
                  阅读
                </a>
                <button type="button" className="text-link" style={{ color: '#b1554a' }} onClick={() => removeHighlightItem(item.ref)}>
                  移除
                </button>
              </div>
            </div>
          );
        })
      )}

      {open && (
        <div className="sheet-backdrop" onClick={() => setOpen(false)}>
          <div className="sheet card" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>{editing ? '编辑笔记' : '新建笔记'}</h3>
            <textarea
              className="search-input"
              style={{ minHeight: 120, resize: 'vertical' }}
              autoFocus
              placeholder="记录你的灵修心得…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button className="btn" style={{ marginTop: 12 }} onClick={save}>
              保存
            </button>
          </div>
        </div>
      )}

      {shareTarget && (
        <ShareToSocialSheet
          ref={shareTarget.ref}
          refLabel={shareTarget.label}
          body={shareTarget.body}
          kind="note"
          onClose={() => setShareTarget(null)}
        />
      )}
    </main>
  );
}
