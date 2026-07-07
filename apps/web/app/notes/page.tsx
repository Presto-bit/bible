'use client';

import { useEffect, useMemo, useState } from 'react';
import PageBackBar from '@/components/PageBackBar';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';
import {
  listAllThoughts,
  deleteThought,
  updateThought,
  visibilityLabel,
  type ThoughtRow,
} from '@/lib/reader_thoughts';
import { loadFavoriteRefs, toggleFavorite } from '@/lib/favorites';
import { api, currentUserId, type BibleBook } from '@/lib/api';
import { syncNow } from '@/lib/sync';
import { ShareToSocialSheet } from '@/components/ShareToSocialSheet';
import ThoughtWriteSheet from '@/components/reader/ThoughtWriteSheet';
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

type Tab = 'all' | 'thoughts' | 'bookmarks' | 'highlights';

type FeedItem =
  | { kind: 'thought'; id: string; ref: string; body: string; ts: number; thought: ThoughtRow }
  | { kind: 'bookmark'; id: string; ref: string; label: string }
  | { kind: 'highlight'; id: string; ref: string; mark: HighlightMark; notePreview?: string; ts: number };

const COLOR_FILTER_ALL = 'all';

export default function NotesPage() {
  useEdgeSwipeBack({ href: '/profile' });

  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>('all');
  const [query, setQuery] = useState('');
  const [thoughts, setThoughts] = useState<ThoughtRow[]>([]);
  const [highlights, setHighlights] = useState<{ ref: string; mark: HighlightMark }[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [bookNames, setBookNames] = useState<Record<string, string>>({});
  const [editingThought, setEditingThought] = useState<ThoughtRow | null>(null);
  const [highlightWrite, setHighlightWrite] = useState<null | { ref: string; body: string }>(null);
  const [colorFilter, setColorFilter] = useState<string>(COLOR_FILTER_ALL);
  const [shareTarget, setShareTarget] = useState<null | { ref: string; label: string; body: string }>(null);

  const markDetails = useMemo(() => listMarksDetailed(), [highlights]);

  const refresh = () => {
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

  const removeFavorite = (ref: string) => {
    if (loadFavoriteRefs().includes(ref)) toggleFavorite(ref);
    refresh();
  };

  const removeHighlightItem = (ref: string) => {
    removeHighlight(ref);
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
    const thought = note?.id ? thoughts.find((t) => t.id === note.id) : undefined;
    if (thought) {
      setEditingThought(thought);
      return;
    }
    setHighlightWrite({ ref, body: note?.body || '' });
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

  const feed = useMemo((): FeedItem[] => {
    const items: FeedItem[] = [
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
  }, [thoughts, favorites, markDetails, bookNames]);

  const filteredFeed = useMemo(() => {
    const q = query.trim().toLowerCase();
    return feed.filter((item) => {
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
      if (!q) return true;
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
  }, [feed, tab, query, colorFilter]);

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'all', label: '全部', count: feed.length },
    { id: 'thoughts', label: '想法', count: thoughts.length },
    { id: 'bookmarks', label: '书签', count: favorites.length },
    { id: 'highlights', label: '划线', count: highlights.length },
  ];

  return (
    <main className="container">
      <header className="page-head">
        <PageBackBar href="/profile" label="我的" />
        <h2 className="page-head-title">我的想法</h2>
      </header>

      <div className="search-bar" style={{ marginBottom: 12 }}>
        <input
          className="search-input"
          placeholder="搜索想法、划线或书签…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

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
          if (item.kind === 'thought') {
            return (
              <div key={`thought-${item.id}`} className="card card-2" style={{ marginBottom: 10, padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                  <span className="pill pill-active" style={{ fontSize: 10 }}>想法</span>
                  <span className={`thought-vis-badge thought-vis-${item.thought.visibility}`}>
                    {visibilityLabel(item.thought.visibility)}
                  </span>
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
                  <button type="button" className="text-link" onClick={() => setEditingThought(item.thought)}>
                    编辑
                  </button>
                  {item.thought.visibility !== 'private' && (
                    <button
                      type="button"
                      className="text-link"
                      onClick={() => setShareTarget({ ref: item.ref, label: refLabel(item.ref), body: item.body })}
                    >
                      分享
                    </button>
                  )}
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
                  {note?.body ? '编辑想法' : '加想法'}
                </button>
                <button type="button" className="text-link" style={{ color: '#b1554a' }} onClick={() => removeHighlightItem(item.ref)}>
                  删除
                </button>
              </div>
            </div>
          );
        })
      )}

      {shareTarget && (
        <ShareToSocialSheet
          ref={shareTarget.ref}
          refLabel={shareTarget.label}
          body={shareTarget.body}
          kind="thought"
          onClose={() => setShareTarget(null)}
        />
      )}

      {editingThought && (
        <ThoughtWriteSheet
          refStr={editingThought.ref}
          refLabel={refLabel(editingThought.ref)}
          mode="edit"
          initialBody={editingThought.body}
          initialVisibility={editingThought.visibility}
          onSave={(body, visibility) => {
            updateThought(editingThought.id, body, visibility);
            setEditingThought(null);
            refresh();
          }}
          onClose={() => setEditingThought(null)}
        />
      )}

      {highlightWrite && (
        <ThoughtWriteSheet
          refStr={highlightWrite.ref}
          refLabel={formatMarkRefLabel(highlightWrite.ref, bookNames)}
          mode="new"
          initialBody={highlightWrite.body}
          initialVisibility="private"
          onSave={(body, visibility) => {
            upsertMarkNote(highlightWrite.ref, body, visibility);
            setHighlightWrite(null);
            refresh();
          }}
          onClose={() => setHighlightWrite(null)}
        />
      )}
    </main>
  );
}
