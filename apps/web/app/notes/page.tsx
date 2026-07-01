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

type Tab = 'notes' | 'favorites';

export default function NotesPage() {
  const [tab, setTab] = useState<Tab>('notes');
  const [query, setQuery] = useState('');
  const [notes, setNotes] = useState<LocalNote[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [bookNames, setBookNames] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<LocalNote | null>(null);
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);

  const refresh = () => {
    setNotes(listNotes());
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

  const favLabel = (f: Favorite) => {
    const name = bookNames[f.bookId] || f.bookId;
    return `${name} ${f.chapter}${f.verse ? `:${f.verse}` : ''}`;
  };

  const filteredNotes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter(
      (n) =>
        n.body.toLowerCase().includes(q) ||
        (n.ref || '').toLowerCase().includes(q),
    );
  }, [notes, query]);

  const filteredFavorites = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return favorites;
    return favorites.filter(
      (f) => f.ref.toLowerCase().includes(q) || favLabel(f).toLowerCase().includes(q),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [favorites, query, bookNames]);

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
          placeholder="搜索笔记或收藏…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="seg-tabs" style={{ marginBottom: 12 }}>
        <button
          type="button"
          className={`seg-tab ${tab === 'notes' ? 'seg-tab-active' : ''}`}
          onClick={() => setTab('notes')}
        >
          笔记 {notes.length > 0 ? `· ${notes.length}` : ''}
        </button>
        <button
          type="button"
          className={`seg-tab ${tab === 'favorites' ? 'seg-tab-active' : ''}`}
          onClick={() => setTab('favorites')}
        >
          收藏 {favorites.length > 0 ? `· ${favorites.length}` : ''}
        </button>
      </div>

      {tab === 'notes' &&
        (filteredNotes.length === 0 ? (
          <p className="muted" style={{ marginTop: 24, textAlign: 'center' }}>
            {query ? '没有匹配的笔记。' : '还没有笔记。阅读时点经文「写笔记」，或点上方新建。'}
          </p>
        ) : (
          filteredNotes.map((n) => (
            <div key={n.id} className="card card-2" style={{ marginBottom: 10, padding: 14 }}>
              {n.ref && (
                <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--accent-deep)' }}>
                  {n.ref}
                </div>
              )}
              <p style={{ margin: '6px 0 10px', lineHeight: 1.6 }}>{n.body}</p>
              <div style={{ display: 'flex', gap: 12 }}>
                <button type="button" className="text-link" onClick={() => openEdit(n)}>
                  编辑
                </button>
                <button
                  type="button"
                  className="text-link"
                  style={{ color: '#b1554a' }}
                  onClick={() => del(n.id)}
                >
                  删除
                </button>
              </div>
            </div>
          ))
        ))}

      {tab === 'favorites' &&
        (filteredFavorites.length === 0 ? (
          <p className="muted" style={{ marginTop: 24, textAlign: 'center' }}>
            {query ? '没有匹配的收藏。' : '还没有收藏。阅读时点经文「收藏」即可加入。'}
          </p>
        ) : (
          filteredFavorites.map((f) => (
            <div key={f.ref} className="card card-2" style={{ marginBottom: 10, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 700, color: 'var(--accent-deep)', flex: 1 }}>
                  ★ {favLabel(f)}
                </span>
                <a
                  className="text-link"
                  href={`/reader?book=${f.bookId}&chapter=${f.chapter}`}
                >
                  阅读
                </a>
                <button
                  type="button"
                  className="text-link"
                  style={{ color: '#b1554a' }}
                  onClick={() => removeFavorite(f.ref)}
                >
                  移除
                </button>
              </div>
            </div>
          ))
        ))}

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
    </main>
  );
}
