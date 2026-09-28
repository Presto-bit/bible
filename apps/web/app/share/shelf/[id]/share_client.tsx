'use client';

import { useEffect, useState } from 'react';
import { captureAcquisitionFromLocation } from '@/lib/acquisition';
import { ShareLandingCtas } from '@/components/ShareLandingCtas';
import { BRAND_NAME } from '@/lib/brand';
import {
  getPlatformShelfBook,
  shelfCoverUrl,
  type ShelfBookDetail,
} from '@/lib/shelf_api';
import { shelfBookDisplayTitle } from '@/lib/shelf_toc';
import { shelfBookOpenPath } from '@/lib/shelf_share';

export function ShelfShareClient({ bookId }: { bookId: string }) {
  const [book, setBook] = useState<ShelfBookDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    captureAcquisitionFromLocation();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getPlatformShelfBook(bookId)
      .then((b) => {
        if (!cancelled) {
          setBook(b);
          setErr(null);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : '加载失败');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  if (loading) {
    return <p className="muted">正在打开书目…</p>;
  }

  if (err || !book) {
    return (
      <>
        <p className="muted">{err || '暂时无法打开这本书'}</p>
        <ShareLandingCtas
          secondary={[
            { href: '/', label: `打开${BRAND_NAME}` },
            { href: '/shelf', label: '去书架' },
          ]}
        />
      </>
    );
  }

  const title = shelfBookDisplayTitle(book.title) || book.title || '推荐书目';
  const meta = [book.author, book.subtitle].filter(Boolean).join(' · ');
  const cover = shelfCoverUrl(bookId, book.cover_storage_key, book.cover_version);
  const openHref = shelfBookOpenPath(bookId);

  return (
    <>
      <article className="shelf-share-card">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="shelf-share-cover" src={cover} alt="" />
        ) : (
          <div className="shelf-share-cover shelf-share-cover-fallback" aria-hidden>
            {title.slice(0, 1)}
          </div>
        )}
        <div className="shelf-share-card-body">
          <h2 className="shelf-share-book-title">《{title}》</h2>
          {meta ? <p className="muted shelf-share-book-meta">{meta}</p> : null}
          <p className="muted shelf-share-book-hint">在彼爱书架安静读完</p>
        </div>
      </article>

      <ShareLandingCtas
        installLabel="保存到主屏幕"
        secondary={[
          { href: openHref, label: '打开这本书' },
          { href: '/shelf', label: '逛逛书架' },
          { href: '/', label: `打开${BRAND_NAME}首页` },
        ]}
      />
    </>
  );
}
