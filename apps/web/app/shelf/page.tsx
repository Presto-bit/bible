'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import PageBackBar from '@/components/PageBackBar';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';
import { useSuppressKeepAliveRoute } from '@/components/shell/TabKeepAliveContext';
import {
  listPlatformShelf,
  loadShelfProgress,
  shelfCoverHue,
  type ShelfBookSummary,
} from '@/lib/shelf_api';
import '@/styles/shelf.css';

export default function ShelfPage() {
  const suppress = useSuppressKeepAliveRoute();
  if (suppress) return null;
  return <ShelfListInner />;
}

function ShelfListInner() {
  useEdgeSwipeBack({ href: '/profile' });

  const [items, setItems] = useState<ShelfBookSummary[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listPlatformShelf()
      .then(setItems)
      .catch(() => setErr('暂时无法加载书架'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="container shelf-page">
      <PageBackBar href="/profile" label="我的" />
      <h1 className="page-title">书架</h1>
      <p className="page-lead">安静阅读，在文字里相遇。</p>

      {loading ? <p className="muted">加载中…</p> : null}
      {err ? <p className="muted">{err}</p> : null}

      {!loading && !err && items.length === 0 ? (
        <p className="muted">暂无书目，稍后再来看看。</p>
      ) : null}

      {items.length > 0 ? (
        <>
          <p className="shelf-section-label">平台书架</p>
          <div className="shelf-grid">
            {items.map((book) => {
              const hue = shelfCoverHue(book.title);
              const progress = loadShelfProgress(book.id);
              return (
                <Link
                  key={book.id}
                  href={progress ? `/shelf/${book.id}?section=${encodeURIComponent(progress)}` : `/shelf/${book.id}`}
                  className="shelf-cover"
                  style={{
                    background: `linear-gradient(145deg, hsl(${hue} 42% 38%), hsl(${(hue + 36) % 360} 36% 28%))`,
                  }}
                >
                  <span className="shelf-cover-badge">平台</span>
                  <span className="shelf-cover-title">{book.title}</span>
                </Link>
              );
            })}
          </div>
        </>
      ) : null}
    </main>
  );
}
