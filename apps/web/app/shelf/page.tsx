'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import PageBackBar from '@/components/PageBackBar';
import ShelfCoverTile from '@/components/shelf/ShelfCoverTile';
import ShelfManageSheet from '@/components/shelf/ShelfManageSheet';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';
import { useSuppressKeepAliveRoute } from '@/components/shell/TabKeepAliveContext';
import { adminCheck } from '@/lib/admin_rag';
import { canManageShelf } from '@/lib/shelf_admin';
import {
  invalidateShelfListCache,
  listPlatformShelfFull,
  type ShelfBookSummary,
  type ShelfGroup,
} from '@/lib/shelf_api';
import { peekShelfListCache } from '@/lib/shelf_cache';
import '@/styles/shelf.css';

export default function ShelfPage() {
  const suppress = useSuppressKeepAliveRoute();
  if (suppress) return null;
  return <ShelfListInner />;
}

function ShelfListInner() {
  useEdgeSwipeBack({ href: '/profile' });

  const cached = peekShelfListCache(true);
  const [groups, setGroups] = useState<ShelfGroup[]>(() => cached?.groups ?? []);
  const [items, setItems] = useState<ShelfBookSummary[]>(() => cached?.items ?? []);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(() => !cached);
  const [canManage, setCanManage] = useState(false);
  const [manageBook, setManageBook] = useState<ShelfBookSummary | null>(null);

  const reload = useCallback((force = false) => {
    if (force) invalidateShelfListCache();
    setLoading(true);
    setErr('');
    return listPlatformShelfFull()
      .then((data) => {
        setGroups(data.groups ?? []);
        setItems(data.items ?? []);
      })
      .catch(() => setErr('暂时无法加载书架'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void reload(false);
  }, [reload]);

  useEffect(() => {
    if (!canManageShelf()) {
      setCanManage(false);
      return;
    }
    void adminCheck().then(setCanManage);
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, ShelfBookSummary[]>();
    for (const g of groups) map.set(g.id, []);
    if (!map.has('default')) map.set('default', []);
    for (const book of items) {
      const gid = book.group_id || 'default';
      if (!map.has(gid)) map.set(gid, []);
      map.get(gid)!.push(book);
    }
    const order = [...groups].sort((a, b) => (b.sort_order ?? 0) - (a.sort_order ?? 0));
    const seen = new Set(order.map((g) => g.id));
    const extras = [...map.keys()].filter((id) => !seen.has(id));
    const rows: { group: ShelfGroup; books: ShelfBookSummary[] }[] = [];
    for (const g of order) {
      const books = map.get(g.id) ?? [];
      if (books.length > 0) rows.push({ group: g, books });
    }
    for (const id of extras) {
      const books = map.get(id) ?? [];
      if (books.length > 0) {
        rows.push({ group: { id, title: '未分组' }, books });
      }
    }
    return rows;
  }, [groups, items]);

  return (
    <main className="container shelf-page">
      <PageBackBar href="/profile" label="我的" />
      <h1 className="page-title">书架</h1>
      <p className="page-lead">
        安静阅读，在文字里相遇。
        {canManage ? ' 长按封面可管理书目。' : null}
      </p>

      {loading ? <p className="muted">加载中…</p> : null}
      {err ? <p className="muted">{err}</p> : null}

      {!loading && !err && items.length === 0 ? (
        <p className="muted">暂无书目，稍后再来看看。</p>
      ) : null}

      {grouped.map(({ group, books }) => (
        <section key={group.id} className="shelf-group-section">
          <p className="shelf-section-label">{group.title}</p>
          <div className="shelf-grid">
            {books.map((book) => (
              <ShelfCoverTile
                key={book.id}
                book={book}
                onManage={canManage ? setManageBook : undefined}
              />
            ))}
          </div>
        </section>
      ))}

      <ShelfManageSheet
        book={manageBook}
        groups={groups}
        onClose={() => setManageBook(null)}
        onChanged={() => void reload(true)}
      />
    </main>
  );
}
