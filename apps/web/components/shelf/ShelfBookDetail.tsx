'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import PageBackBar from '@/components/PageBackBar';
import ShelfCoverPlate from '@/components/shelf/ShelfCoverPlate';
import ShelfPostCard from '@/components/shelf/ShelfPostCard';
import { useToast } from '@/components/ui/ToastProvider';
import { getPlatformShelfBook, clearShelfBookFinished, loadShelfBookProgress, type ShelfBookDetail } from '@/lib/shelf_api';
import {
  buildShelfCheckinRef,
  formatShelfCheckinLabel,
  rememberShelfRefLabel,
} from '@/lib/shelf_checkin';
import {
  createShelfPost,
  deleteShelfPost,
  listShelfPosts,
  toggleShelfPostLike,
  updateShelfPostVisibility,
  type ShelfPost,
  type ShelfPostVisibility,
} from '@/lib/shelf_posts';
import { useShelfLoginGate } from '@/components/shelf/ShelfReplyComposer';

const ShelfPostWriteSheet = dynamic(
  () => import('@/components/shelf/ShelfPostWriteSheet'),
  { ssr: false },
);
const ShelfNoteHubSheet = dynamic(
  () => import('@/components/shelf/ShelfNoteHubSheet'),
  { ssr: false },
);

type Tab = 'reviews' | 'notes' | 'mine';

function readHref(bookId: string, sectionId?: string | null, pageIndex?: number) {
  const params = new URLSearchParams();
  if (sectionId) params.set('section', sectionId);
  if (typeof pageIndex === 'number' && pageIndex > 0) params.set('page', String(pageIndex));
  const qs = params.toString();
  return `/shelf/${encodeURIComponent(bookId)}/read${qs ? `?${qs}` : ''}`;
}

export default function ShelfBookDetail({ bookId }: { bookId: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const flashToast = useToast();
  const requireLogin = useShelfLoginGate(flashToast);
  const [book, setBook] = useState<ShelfBookDetail | null>(null);
  const [bookErr, setBookErr] = useState('');
  const [tab, setTab] = useState<Tab>(() => {
    const t = search.get('tab');
    if (t === 'notes' || t === 'mine') return t;
    return 'reviews';
  });
  const [posts, setPosts] = useState<ShelfPost[]>([]);
  const [postsErr, setPostsErr] = useState('');
  const [stats, setStats] = useState({ reviews: 0, notes: 0 });
  const [loading, setLoading] = useState(true);
  const [postsLoading, setPostsLoading] = useState(false);
  const [writeReview, setWriteReview] = useState(false);
  const [hubPostId, setHubPostId] = useState<string | null>(null);
  const [hubAbstract, setHubAbstract] = useState<string | undefined>();

  const progress = useMemo(() => loadShelfBookProgress(bookId), [bookId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setBookErr('');
    void getPlatformShelfBook(bookId)
      .then((detail) => {
        if (!cancelled) setBook(detail);
      })
      .catch(() => {
        if (!cancelled) setBookErr('暂时无法加载书目');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  const reloadPosts = useCallback(() => {
    const kind = tab === 'reviews' ? 'review' : tab === 'notes' ? 'note' : undefined;
    setPostsLoading(true);
    setPostsErr('');
    void listShelfPosts(bookId, {
      kind: kind as 'review' | 'note' | undefined,
      mine: tab === 'mine',
      sort: 'latest',
    })
      .then((data) => {
        setPosts(data.items);
        setStats(data.stats);
      })
      .catch(() => setPostsErr('评论加载失败'))
      .finally(() => setPostsLoading(false));
  }, [bookId, tab]);

  useEffect(() => {
    if (!book) return;
    reloadPosts();
  }, [book, reloadPosts]);

  const continueHref = readHref(bookId, progress?.sectionId, progress?.pageIndex);

  const onWriteReview = async () => {
    if (!(await requireLogin())) return;
    setWriteReview(true);
  };

  const submitReview = async (body: string, visibility: ShelfPostVisibility, readStatus?: 'reading' | 'finished') => {
    const ref = buildShelfCheckinRef(bookId, progress?.sectionId || 'book');
    rememberShelfRefLabel(ref, formatShelfCheckinLabel(book?.title || '', progress?.sectionId || ''));
    try {
      await createShelfPost(bookId, {
        kind: 'review',
        ref,
        body,
        visibility,
        read_status: readStatus,
        section_id: progress?.sectionId || undefined,
      });
      flashToast('已发布');
      reloadPosts();
    } catch {
      flashToast('发布失败');
    }
  };

  const onLike = async (post: ShelfPost) => {
    if (!(await requireLogin())) return;
    try {
      await toggleShelfPostLike(bookId, post.id);
      reloadPosts();
    } catch {
      flashToast('操作失败');
    }
  };

  if (loading && !book) {
    return (
      <main className="shelf-detail-page">
        <PageBackBar href="/shelf" ariaLabel="返回书架" />
        <p className="muted shelf-detail-loading">加载中…</p>
      </main>
    );
  }

  if (bookErr && !book) {
    return (
      <main className="shelf-detail-page">
        <PageBackBar href="/shelf" ariaLabel="返回书架" />
        <p className="muted shelf-detail-loading">{bookErr}</p>
      </main>
    );
  }

  return (
    <main className="shelf-detail-page">
      <PageBackBar href="/shelf" ariaLabel="返回书架" />

      <section className="shelf-detail-hero">
        <ShelfCoverPlate title={book?.title || ''} size="detail" />
        <h1 className="shelf-detail-title">{book?.title}</h1>
        {book?.author ? <p className="shelf-detail-author muted">{book.author}</p> : null}
        {book?.subtitle ? (
          <div className="shelf-detail-blurb">
            <p className="shelf-detail-sub muted">{book.subtitle}</p>
          </div>
        ) : null}
        <button
          type="button"
          className="btn primary shelf-detail-continue"
          onClick={() => {
            clearShelfBookFinished(bookId);
            router.push(continueHref);
          }}
        >
          {progress?.sectionId ? '继续阅读' : '开始阅读'}
        </button>
        <p className="shelf-detail-stats muted">
          {stats.reviews} 篇书评 · {stats.notes} 条公开笔记
        </p>
      </section>

      <div className="shelf-detail-tabs" role="tablist">
        {(['reviews', 'notes', 'mine'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={`shelf-detail-tab${tab === t ? ' is-active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'reviews' ? '书评' : t === 'notes' ? '公开笔记' : '我的'}
          </button>
        ))}
      </div>

      <div className="shelf-detail-list">
        {postsLoading && posts.length === 0 ? (
          <p className="muted shelf-detail-empty">加载中…</p>
        ) : postsErr && posts.length === 0 ? (
          <p className="muted shelf-detail-empty">{postsErr}</p>
        ) : posts.length === 0 ? (
          <p className="muted shelf-detail-empty">
            {tab === 'reviews' ? '还没有书评，读完写几句也很好' : '暂无内容'}
          </p>
        ) : (
          posts.map((post) => (
            <ShelfPostCard
              key={post.id}
              post={post}
              onLike={() => void onLike(post)}
              onOpen={() => {
                setHubAbstract(post.abstract ?? undefined);
                setHubPostId(post.id);
              }}
              showVis={tab === 'mine'}
              onVisChange={(v) => {
                void updateShelfPostVisibility(bookId, post.id, v)
                  .then(reloadPosts)
                  .catch(() => flashToast('更新失败'));
              }}
              onDelete={() => {
                void deleteShelfPost(bookId, post.id)
                  .then(reloadPosts)
                  .catch(() => flashToast('删除失败'));
              }}
            />
          ))
        )}
      </div>

      {tab === 'reviews' ? (
        <button type="button" className="shelf-detail-fab" aria-label="写书评" onClick={() => void onWriteReview()}>
          写书评
        </button>
      ) : null}

      {writeReview ? (
        <ShelfPostWriteSheet
          title="写书评"
          contextLabel={book?.title || ''}
          contextBody={book?.subtitle}
          placeholder="写下读完的感受…"
          kind="review"
          showReadStatus
          onSave={(body, vis, rs) => void submitReview(body, vis, rs)}
          onClose={() => setWriteReview(false)}
        />
      ) : null}

      {hubPostId ? (
        <ShelfNoteHubSheet
          bookId={bookId}
          postId={hubPostId}
          abstract={hubAbstract}
          onClose={() => setHubPostId(null)}
          onChanged={reloadPosts}
        />
      ) : null}
    </main>
  );
}
