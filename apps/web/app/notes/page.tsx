'use client';

/**
 * 我的想法：想法 / 划线（无书签、无笔记）。
 * 想法：分组列表 + 下钻；可新建自定义想法；划线：色点筛选。
 * 小爱回答可「存想法」。
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import PageBackBar from '@/components/PageBackBar';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';
import {
  addThought,
  listAllThoughts,
  deleteThought,
  updateThought,
  visibilityLabel,
  type ThoughtRow,
} from '@/lib/reader_thoughts';
import { api, currentUserId, type BibleBook } from '@/lib/api';
import { syncNow } from '@/lib/sync';
import { ShareToSocialSheet } from '@/components/ShareToSocialSheet';
import ThoughtWriteSheet from '@/components/reader/ThoughtWriteSheet';
import { listHighlightRefs, removeHighlight, type HighlightMark } from '@/lib/reader_highlights';
import { formatMarkRefLabel, readerMarkHref } from '@/lib/mark_ref';
import { MARK_COLOR_SEMANTICS, MARK_COLORS } from '@/lib/mark_semantics';
import { noteForMarkRef, upsertMarkNote } from '@/lib/mark_notes';
import { listMarksDetailed } from '@/lib/mark_stats';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import type { HighlightColor } from '@/lib/reader_highlights';

/** 无经文关联的自定义想法 */
const FREE_THOUGHT_REF = 'FREE';

type Tab = 'thoughts' | 'highlights';

const COLOR_FILTER_ALL = 'all';

function bookIdFromRef(ref: string): string {
  return (ref || '').split('.')[0] || 'FREE';
}

function bookLabel(bookId: string, bookNames: Record<string, string>): string {
  if (bookId === 'FREE' || bookId === 'OTHER') return '随想';
  return bookNames[bookId] || bookId;
}

export default function NotesPage() {
  useEdgeSwipeBack({ href: '/profile' });

  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>('thoughts');
  const [query, setQuery] = useState('');
  const [thoughts, setThoughts] = useState<ThoughtRow[]>([]);
  const [highlights, setHighlights] = useState<{ ref: string; mark: HighlightMark }[]>([]);
  const [bookNames, setBookNames] = useState<Record<string, string>>({});
  const [colorFilter, setColorFilter] = useState<string>(COLOR_FILTER_ALL);
  const [editingThought, setEditingThought] = useState<ThoughtRow | null>(null);
  const [creatingThought, setCreatingThought] = useState(false);
  const [draftBody, setDraftBody] = useState('');
  const [highlightWrite, setHighlightWrite] = useState<null | { ref: string; body: string }>(null);
  const [thoughtGroup, setThoughtGroup] = useState<string | null>(null);
  const [thoughtDetail, setThoughtDetail] = useState<ThoughtRow | null>(null);
  const [shareTarget, setShareTarget] = useState<null | { ref: string; label: string; body: string }>(
    null,
  );

  const markDetails = useMemo(() => listMarksDetailed(), [highlights]);

  const refresh = () => {
    setThoughts(listAllThoughts());
    setHighlights(listHighlightRefs());
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
      syncNow()
        .then(() => refresh())
        .catch(() => {});
    }
  }, []);

  const refLabel = (ref: string) => {
    if (!ref || ref === FREE_THOUGHT_REF) return '随想';
    const [bookId, ch, tail] = ref.split('.');
    const name = bookNames[bookId] || bookId;
    if (!ch) return name;
    if (!tail) return `${name} ${ch}`;
    return `${name} ${ch}:${tail.replace('-', '–')}`;
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
    setThoughtDetail(null);
    refresh();
  };

  const removeHighlightItem = (ref: string) => {
    removeHighlight(ref);
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

  const q = query.trim().toLowerCase();

  const filteredThoughts = useMemo(() => {
    return thoughts.filter((t) => {
      if (!q) return true;
      return t.body.toLowerCase().includes(q) || t.ref.toLowerCase().includes(q);
    });
  }, [thoughts, q]);

  const thoughtGroups = useMemo(() => {
    const map = new Map<string, ThoughtRow[]>();
    for (const t of filteredThoughts) {
      const bid = bookIdFromRef(t.ref);
      const list = map.get(bid) ?? [];
      list.push(t);
      map.set(bid, list);
    }
    return [...map.entries()]
      .map(([bookId, items]) => ({
        bookId,
        label: bookLabel(bookId, bookNames),
        items: items.sort((a, b) => b.createdAtMs - a.createdAtMs),
      }))
      .sort((a, b) => {
        if (a.bookId === 'FREE') return -1;
        if (b.bookId === 'FREE') return 1;
        return a.label.localeCompare(b.label, 'zh');
      });
  }, [filteredThoughts, bookNames]);

  const groupThoughts = useMemo(() => {
    if (!thoughtGroup) return [];
    return thoughtGroups.find((g) => g.bookId === thoughtGroup)?.items ?? [];
  }, [thoughtGroup, thoughtGroups]);

  const filteredHighlights = useMemo(() => {
    return markDetails.filter((h) => {
      if (colorFilter !== COLOR_FILTER_ALL && h.color !== colorFilter) return false;
      if (!q) return true;
      return (
        h.ref.toLowerCase().includes(q) ||
        (h.notePreview || '').toLowerCase().includes(q)
      );
    });
  }, [markDetails, colorFilter, q]);

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'thoughts', label: '想法', count: thoughts.length },
    { id: 'highlights', label: '划线', count: highlights.length },
  ];

  const DOT_COLORS: Record<HighlightColor, string> = {
    yellow: '#e6c84a',
    green: '#6aaf5e',
    blue: '#5b8fd9',
    pink: '#d9789a',
    orange: '#e09a4a',
  };

  const openCreate = () => {
    setTab('thoughts');
    setThoughtGroup(null);
    setThoughtDetail(null);
    setCreatingThought(true);
    setDraftBody('');
  };

  const cancelCreate = () => {
    setCreatingThought(false);
    setDraftBody('');
  };

  const saveCreate = () => {
    const body = draftBody.trim();
    if (!body) return;
    addThought(FREE_THOUGHT_REF, body, 'private', { skipPublish: true });
    setCreatingThought(false);
    setDraftBody('');
    refresh();
  };

  return (
    <main className="container">
      <header className="page-head">
        <PageBackBar href="/profile" label="我的" />
        <h2 className="page-head-title">我的想法</h2>
        <div className="page-head-actions">
          <button
            type="button"
            className="icon-btn"
            aria-label="新建想法"
            title="新建想法"
            onClick={openCreate}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
      </header>

      <div className="search-bar" style={{ marginBottom: 12 }}>
        <input
          className="search-input"
          placeholder="搜索想法或划线…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="seg-tabs notes-seg-tabs" style={{ marginBottom: 12 }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`seg-tab ${tab === t.id ? 'seg-tab-active' : ''}`}
            onClick={() => {
              setTab(t.id);
              setThoughtGroup(null);
              setThoughtDetail(null);
            }}
          >
            {t.label}
            {t.count > 0 ? ` · ${t.count}` : ''}
          </button>
        ))}
      </div>

      {tab === 'highlights' && (
        <div className="mark-color-filter" role="toolbar" aria-label="按颜色筛选划线">
          <button
            type="button"
            className={`mark-color-filter-all ${colorFilter === COLOR_FILTER_ALL ? 'is-active' : ''}`}
            onClick={() => setColorFilter(COLOR_FILTER_ALL)}
          >
            全部
          </button>
          {MARK_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`mark-color-dot ${colorFilter === c ? 'is-active' : ''}`}
              style={{ ['--mark-dot' as string]: DOT_COLORS[c] }}
              title={MARK_COLOR_SEMANTICS[c].label}
              aria-label={MARK_COLOR_SEMANTICS[c].label}
              onClick={() => setColorFilter(colorFilter === c ? COLOR_FILTER_ALL : c)}
            >
              <span className="mark-color-dot-core" />
              <span className="mark-color-dot-label">{MARK_COLOR_SEMANTICS[c].label}</span>
            </button>
          ))}
        </div>
      )}

      {tab === 'thoughts' && (
        <>
          {creatingThought && (
            <div className="card card-2 thought-inline-composer">
              <div className="thought-inline-composer-meta">
                <span className="pill">私有</span>
                <span className="muted" style={{ fontSize: 12 }}>
                  随想
                </span>
              </div>
              <textarea
                className="thought-inline-input"
                placeholder="写下你的领受、疑问或祷告…"
                value={draftBody}
                rows={4}
                autoFocus
                onChange={(e) => setDraftBody(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    saveCreate();
                  }
                }}
              />
              <div className="thought-inline-actions">
                <button type="button" className="text-link" onClick={cancelCreate}>
                  取消
                </button>
                <button
                  type="button"
                  className="btn"
                  style={{ padding: '8px 16px', minHeight: 36 }}
                  disabled={!draftBody.trim()}
                  onClick={saveCreate}
                >
                  保存
                </button>
              </div>
            </div>
          )}
          {thoughtDetail ? (
            <div className="card card-2" style={{ padding: 14 }}>
              <button
                type="button"
                className="text-link"
                style={{ marginBottom: 10 }}
                onClick={() => setThoughtDetail(null)}
              >
                ← 返回列表
              </button>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                <span className={`thought-vis-badge thought-vis-${thoughtDetail.visibility}`}>
                  {visibilityLabel(thoughtDetail.visibility)}
                </span>
                {thoughtDetail.ref && thoughtDetail.ref !== FREE_THOUGHT_REF ? (
                  <Link href={readerMarkHref(thoughtDetail.ref)} className="text-link">
                    {refLabel(thoughtDetail.ref)}
                  </Link>
                ) : (
                  <span className="muted" style={{ fontSize: 13 }}>
                    {refLabel(thoughtDetail.ref)}
                  </span>
                )}
              </div>
              <p style={{ lineHeight: 1.65, marginBottom: 14 }}>{thoughtDetail.body}</p>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="text-link"
                  onClick={() => setEditingThought(thoughtDetail)}
                >
                  编辑
                </button>
                {thoughtDetail.visibility !== 'private' && (
                  <button
                    type="button"
                    className="text-link"
                    onClick={() =>
                      setShareTarget({
                        ref: thoughtDetail.ref,
                        label: refLabel(thoughtDetail.ref),
                        body: thoughtDetail.body,
                      })
                    }
                  >
                    分享
                  </button>
                )}
                <button
                  type="button"
                  className="text-link"
                  style={{ color: '#b1554a' }}
                  onClick={() => void removeThought(thoughtDetail.id)}
                >
                  删除
                </button>
              </div>
            </div>
          ) : thoughtGroup ? (
            <>
              <button
                type="button"
                className="text-link"
                style={{ marginBottom: 12 }}
                onClick={() => setThoughtGroup(null)}
              >
                ← 全部分组
              </button>
              <h3 style={{ margin: '0 0 10px', fontSize: 16 }}>
                {bookLabel(thoughtGroup, bookNames)}
                <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>
                  {' '}
                  · {groupThoughts.length}
                </span>
              </h3>
              {groupThoughts.length === 0 ? (
                <p className="muted">该分组暂无想法。</p>
              ) : (
                groupThoughts.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="card card-2 notes-drill-row"
                    onClick={() => setThoughtDetail(t)}
                  >
                    <span className="muted" style={{ fontSize: 12 }}>
                      {refLabel(t.ref)}
                    </span>
                    <strong className="notes-drill-title">
                      {t.body.trim().split(/\n/)[0].slice(0, 40) || '（空）'}
                    </strong>
                    <span className="muted notes-drill-preview">
                      {t.body.length > 80 ? `${t.body.slice(0, 80)}…` : t.body}
                    </span>
                  </button>
                ))
              )}
            </>
          ) : filteredThoughts.length === 0 ? (
            <p className="muted" style={{ marginTop: 24, textAlign: 'center' }}>
              {query
                ? '没有匹配的想法。'
                : '还没有想法。点右上角 + 新建，或在小爱回答里存想法。'}
            </p>
          ) : (
            thoughtGroups.map((g) => (
              <button
                key={g.bookId}
                type="button"
                className="card row-card notes-group-row"
                onClick={() => setThoughtGroup(g.bookId)}
              >
                <span className="notes-group-main">
                  <strong>{g.label}</strong>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {g.items[0]?.body.trim().slice(0, 28) || '查看想法'}
                    {(g.items[0]?.body.length || 0) > 28 ? '…' : ''}
                  </span>
                </span>
                <span className="muted">{g.items.length} ›</span>
              </button>
            ))
          )}
        </>
      )}

      {tab === 'highlights' && (
        <>
          {filteredHighlights.length === 0 ? (
            <p className="muted" style={{ marginTop: 24, textAlign: 'center' }}>
              {query || colorFilter !== COLOR_FILTER_ALL
                ? '没有匹配的划线。'
                : '还没有划线。阅读时选中经文可划线。'}
            </p>
          ) : (
            filteredHighlights.map((h) => {
              const sem = MARK_COLOR_SEMANTICS[h.color];
              const note = noteForMarkRef(h.ref);
              return (
                <div key={h.ref} className="card card-2" style={{ marginBottom: 10, padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span
                      className="mark-color-dot-inline"
                      style={{ background: DOT_COLORS[h.color] }}
                      title={sem.label}
                    />
                    <span className="muted" style={{ fontSize: 12 }}>
                      {sem.label}
                    </span>
                    <span style={{ fontWeight: 700, color: 'var(--accent-deep)', flex: 1 }}>
                      {formatMarkRefLabel(h.ref, bookNames)}
                    </span>
                  </div>
                  {(h.notePreview || note?.body) && (
                    <p className="muted" style={{ margin: '0 0 8px', fontSize: 13, lineHeight: 1.5 }}>
                      {h.notePreview || note?.body}
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <Link className="text-link" href={readerMarkHref(h.ref)}>
                      跳转经文
                    </Link>
                    <button type="button" className="text-link" onClick={() => openHighlightEdit(h.ref)}>
                      {note?.body ? '编辑想法' : '加想法'}
                    </button>
                    <button
                      type="button"
                      className="text-link"
                      style={{ color: '#b1554a' }}
                      onClick={() => removeHighlightItem(h.ref)}
                    >
                      删除
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </>
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
            setThoughtDetail((d) =>
              d && d.id === editingThought.id ? { ...d, body, visibility } : d,
            );
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
