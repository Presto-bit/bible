'use client';

import { useEffect, useMemo, useState } from 'react';
import PageBackBar from '@/components/PageBackBar';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';
import {
  createNote,
  listNotes,
  removeNote,
  updateNote,
  type LocalNote,
} from '@/lib/notes';
import { loadFavoriteRefs, toggleFavorite } from '@/lib/favorites';
import { api, currentUserId, effectiveId, type BibleBook } from '@/lib/api';
import { syncNow } from '@/lib/sync';
import { ShareToSocialSheet } from '@/components/ShareToSocialSheet';
import { listAllThoughts, deleteThought, updateThought, type ThoughtRow } from '@/lib/reader_thoughts';
import { listHighlightRefs, removeHighlight, type HighlightMark } from '@/lib/reader_highlights';
import { formatMarkRefLabel, readerMarkHref } from '@/lib/mark_ref';
import { MARK_COLOR_SEMANTICS, MARK_COLORS } from '@/lib/mark_semantics';
import { noteForMarkRef, upsertMarkNote } from '@/lib/mark_notes';
import { listMarksDetailed } from '@/lib/mark_stats';
import Link from 'next/link';
import { useConfirm } from '@/components/ui/ConfirmProvider';

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

type Tab = 'all' | 'notes' | 'thoughts' | 'bookmarks' | 'highlights';

type FeedItem =
  | { kind: 'note'; id: string; ref?: string | null; body: string; ts: number; note: LocalNote }
  | { kind: 'thought'; id: string; ref: string; body: string; ts: number; thought: ThoughtRow }
  | { kind: 'bookmark'; id: string; ref: string; label: string }
  | { kind: 'highlight'; id: string; ref: string; mark: HighlightMark; notePreview?: string; ts: number };

const COLOR_FILTER_ALL = 'all';

export default function NotesPage() {
  useEdgeSwipeBack({ href: '/profile' });

  const confirm = useConfirm();
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
  const [colorFilter, setColorFilter] = useState<string>(COLOR_FILTER_ALL);

  const [shareTarget, setShareTarget] = useState<null | { ref: string; label: string; body: string; kind: 'thought' | 'note' }>(null);
  const [editingThought, setEditingThought] = useState<ThoughtRow | null>(null);
  const [thoughtDraft, setThoughtDraft] = useState('');
  const [editingHighlightRef, setEditingHighlightRef] = useState<string | null>(null);
  const [highlightNoteDraft, setHighlightNoteDraft] = useState('');

  const markDetails = useMemo(() => listMarksDetailed(), [highlights]);

  const refresh = () => {
    setNotes(listNotes());
    setThoughts(listAllThoughts().filter((t) => t.authorId === (effectiveId() || 'me')));
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

  const openThoughtEdit = (t: ThoughtRow) => {
    setEditingThought(t);
    setThoughtDraft(t.body);
  };

  const saveThoughtEdit = () => {
    if (!editingThought) return;
    const body = thoughtDraft.trim();
    if (!body) return;
    updateThought(editingThought.id, body);
    setEditingThought(null);
    refresh();
  };

  const removeThought = async (id: string) => {
    const ok = await confirm({
      title: '删除想法',
      message: '确定删除这条想法？',
      confirmLabel: '删除',
      danger: true,
    });
    if (!ok) return;
    deleteThought(id);
    refresh();
  };

  const openHighlightEdit = (ref: string) => {
    const note = noteForMarkRef(ref);
    setEditingHighlightRef(ref);
    setHighlightNoteDraft(note?.body || '');
  };

  const saveHighlightNote = () => {
    if (!editingHighlightRef) return;
    const body = highlightNoteDraft.trim();
    if (!body) return;
    upsertMarkNote(editingHighlightRef, body);
    setEditingHighlightRef(null);
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
        thought: t,
      })),
      ...favorites.map((f) => ({
        kind: 'bookmark' as const,
        id: f.ref,
        ref: f.ref,
        label: favLabel(f),
      })),
      ...markDetails.map((h) => ({
        kind: 'highlight' as const,
        id: h.ref,
        ref: h.ref,
        mark: { color: h.color },
        notePreview: h.notePreview,
        ts: h.createdAt,
      })),
    ];
    items.sort((a, b) => {
      const ta = 'ts' in a ? a.ts : 0;
      const tb = 'ts' in b ? b.ts : 0;
      return tb - ta;
    });
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, thoughts, favorites, markDetails, bookNames]);

  const filteredFeed = useMemo(() => {
    const q = query.trim().toLowerCase();
    return feed.filter((item) => {
      if (tab === 'notes' && item.kind !== 'note') return false;
      if (tab === 'thoughts' && item.kind !== 'thought') return false;
      if (tab === 'bookmarks' && item.kind !== 'bookmark') return false;
      if (tab === 'highlights' && item.kind !== 'highlight') return false;
      if (
        tab === 'highlights' &&
        colorFilter !== COLOR_FILTER_ALL &&
        item.kind === 'highlight' &&
        item.mark.color !== colorFilter
      ) {
        return false;
      }
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
      if (item.kind === 'bookmark') {
        return item.ref.toLowerCase().includes(q) || item.label.toLowerCase().includes(q);
      }
      if (item.kind === 'highlight') {
        return (
          item.ref.toLowerCase().includes(q) ||
          (item.notePreview || '').toLowerCase().includes(q)
        );
      }
      return false;
    });
  }, [feed, tab, query, tagFilter, colorFilter]);

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'all', label: '全部', count: feed.length },
    { id: 'notes', label: '笔记', count: notes.length },
    { id: 'thoughts', label: '想法', count: thoughts.length },
    { id: 'bookmarks', label: '书签', count: favorites.length },
    { id: 'highlights', label: '划线', count: highlights.length },
  ];

  return (
    <main className="container">
      <header className="page-head">
        <PageBackBar href="/profile" label="我的" />
        <h2 className="page-head-title">经文记忆</h2>
        <button type="button" className="font-pill" onClick={openNew}>
          + 新建
        </button>
      </header>

      <div className="search-bar" style={{ marginBottom: 12 }}>
        <input
          className="search-input"
          placeholder="搜索笔记、想法、划线或书签…"
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

      {tab === 'highlights' && (
        <div className="tag-filter-row" style={{ marginBottom: 12 }}>
          <button
            type="button"
            className={`pill ${colorFilter === COLOR_FILTER_ALL ? 'pill-active' : ''}`}
            onClick={() => setColorFilter(COLOR_FILTER_ALL)}
          >
            全部
          </button>
          {MARK_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`pill ${colorFilter === c ? 'pill-active' : ''}`}
              onClick={() => setColorFilter(colorFilter === c ? COLOR_FILTER_ALL : c)}
            >
              {MARK_COLOR_SEMANTICS[c].label}
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
                    <Link
                      href={readerMarkHref(item.ref)}
                      style={{ fontWeight: 700, fontSize: 12, color: 'var(--accent-deep)' }}
                    >
                      {formatMarkRefLabel(item.ref, bookNames)}
                    </Link>
                  )}
                </div>
                <p style={{ margin: '6px 0 10px', lineHeight: 1.6 }}>{item.body}</p>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {item.ref && (
                    <Link href={readerMarkHref(item.ref)} className="text-link">
                      跳转经文
                    </Link>
                  )}
                  <button type="button" className="text-link" onClick={() => openEdit(item.note)}>
                    编辑
                  </button>
                  {item.ref && (
                    <button
                      type="button"
                      className="text-link"
                      onClick={() => setShareTarget({ ref: item.ref!, label: item.ref!, body: item.body, kind: 'note' })}
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
                  <Link
                    href={readerMarkHref(item.ref)}
                    style={{ fontWeight: 700, fontSize: 12, color: 'var(--accent-deep)' }}
                  >
                    {refLabel(item.ref)}
                  </Link>
                </div>
                <p style={{ margin: '6px 0 10px', lineHeight: 1.6 }}>{item.body}</p>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <Link href={readerMarkHref(item.ref)} className="text-link">
                    跳转经文
                  </Link>
                  <button type="button" className="text-link" onClick={() => openThoughtEdit(item.thought)}>
                    编辑
                  </button>
                  <button
                    type="button"
                    className="text-link"
                    onClick={() => setShareTarget({ ref: item.ref, label: refLabel(item.ref), body: item.body, kind: 'thought' })}
                  >
                    分享
                  </button>
                  <button type="button" className="text-link" style={{ color: '#b1554a' }} onClick={() => void removeThought(item.id)}>
                    删除
                  </button>
                </div>
              </div>
            );
          }
          if (item.kind === 'bookmark') {
            return (
              <div key={`fav-${item.id}`} className="card card-2" style={{ marginBottom: 10, padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span className="pill" style={{ fontSize: 10 }}>书签</span>
                  <span style={{ fontWeight: 700, color: 'var(--accent-deep)' }}>
                    ★ {item.label}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <Link className="text-link" href={readerMarkHref(item.ref)}>
                    跳转经文
                  </Link>
                  <button
                    type="button"
                    className="text-link"
                    onClick={() => setShareTarget({ ref: item.ref, label: item.label, body: '', kind: 'note' })}
                  >
                    分享
                  </button>
                  <button type="button" className="text-link" style={{ color: '#b1554a' }} onClick={() => removeFavorite(item.ref)}>
                    删除
                  </button>
                </div>
              </div>
            );
          }
          const sem = MARK_COLOR_SEMANTICS[item.mark.color];
          const note = noteForMarkRef(item.ref);
          return (
            <div key={`hl-${item.id}`} className="card card-2" style={{ marginBottom: 10, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span className="pill" style={{ fontSize: 10 }}>划线</span>
                <span className={`verse-mark verse-mark-color verse-mark-${item.mark.color}`} style={{ fontSize: 12, padding: '2px 8px' }}>
                  {sem.label}
                </span>
                <span style={{ fontWeight: 700, color: 'var(--accent-deep)', flex: 1 }}>
                  {formatMarkRefLabel(item.ref, bookNames)}
                </span>
              </div>
              {(item.notePreview || note?.body) && (
                <p className="muted" style={{ margin: '0 0 8px', fontSize: 13, lineHeight: 1.5 }}>
                  {item.notePreview || note?.body}
                </p>
              )}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <Link className="text-link" href={readerMarkHref(item.ref)}>
                  跳转经文
                </Link>
                <button type="button" className="text-link" onClick={() => openHighlightEdit(item.ref)}>
                  编辑
                </button>
                <button
                  type="button"
                  className="text-link"
                  onClick={() =>
                    setShareTarget({
                      ref: item.ref,
                      label: formatMarkRefLabel(item.ref, bookNames),
                      body: note?.body || sem.hint,
                      kind: 'note',
                    })
                  }
                >
                  分享
                </button>
                <button type="button" className="text-link" style={{ color: '#b1554a' }} onClick={() => removeHighlightItem(item.ref)}>
                  删除
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
          kind={shareTarget.kind}
          onClose={() => setShareTarget(null)}
        />
      )}

      {editingThought && (
        <div className="sheet-backdrop" onClick={() => setEditingThought(null)}>
          <div className="sheet card" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>编辑想法</h3>
            <p className="muted" style={{ fontSize: 12 }}>{refLabel(editingThought.ref)}</p>
            <textarea
              className="search-input"
              style={{ minHeight: 100, resize: 'vertical' }}
              autoFocus
              value={thoughtDraft}
              onChange={(e) => setThoughtDraft(e.target.value)}
            />
            <button className="btn" style={{ marginTop: 12 }} onClick={saveThoughtEdit}>
              保存
            </button>
          </div>
        </div>
      )}

      {editingHighlightRef && (
        <div className="sheet-backdrop" onClick={() => setEditingHighlightRef(null)}>
          <div className="sheet card" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>编辑划线笔记</h3>
            <p className="muted" style={{ fontSize: 12 }}>{formatMarkRefLabel(editingHighlightRef, bookNames)}</p>
            <textarea
              className="search-input"
              style={{ minHeight: 100, resize: 'vertical' }}
              autoFocus
              placeholder="记录与这段经文相关的灵修笔记…"
              value={highlightNoteDraft}
              onChange={(e) => setHighlightNoteDraft(e.target.value)}
            />
            <button className="btn" style={{ marginTop: 12 }} onClick={saveHighlightNote}>
              保存
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
