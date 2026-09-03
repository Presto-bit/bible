'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import PageBackBar from '@/components/PageBackBar';
import ShelfCoverPlate from '@/components/shelf/ShelfCoverPlate';
import { useToast } from '@/components/ui/ToastProvider';
import { getPlatformShelfBook, loadShelfBookProgress, type ShelfBookDetail } from '@/lib/shelf_api';
import {
  buildShelfCheckinRef,
  formatShelfCheckinLabel,
  rememberShelfRefLabel,
} from '@/lib/shelf_checkin';
import {
  createShelfPost,
  deleteShelfPost,
  formatShelfPostTime,
  listShelfPosts,
  replyShelfPost,
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

function PostCard({
  post,
  onLike,
  onOpen,
  onVisChange,
  onDelete,
  showVis,
}: {
  post: ShelfPost;
  onLike: () => void;
  onOpen: () => void;
  onVisChange?: (v: ShelfPostVisibility) => void;
  onDelete?: () => void;
  showVis?: boolean;
}) {
  return (
    <article className="shelf-post-card card" onClick={onOpen} role="button" tabIndex={0}>
      <div className="shelf-post-meta">
        <span>{post.author.name}</span>
        <span className="muted">{formatShelfPostTime(post.created_at)}</span>
        {post.read_status === 'finished' ? <span className="shelf-post-badge">已读完</span> : null}
      </div>
      {post.abstract ? <blockquote className="shelf-post-quote">{post.abstract}</blockquote> : null}
      <p className="shelf-post-body">{post.body.length > 200 ? `${post.body.slice(0, 200)}…` : post.body}</p>
      <div className="shelf-post-actions" onClick={(e) => e.stopPropagation()}>
        <button type="button" className={`shelf-post-like${post.liked ? ' is-liked' : ''}`} onClick={onLike}>
          ♡ {post.likes_count || ''}
        </button>
        <button type="button" className="shelf-post-reply-btn" onClick={onOpen}>
          💬 {post.replies_count || ''}
        </button>
        {showVis && onVisChange ? (
          <select
            className="shelf-post-vis-select"
            value={post.visibility}
            onChange={(e) => onVisChange(e.target.value as ShelfPostVisibility)}
            aria-label="可见范围"
          >
            <option value="public">公开</option>
            <option value="friends">共读</option>
            <option value="private">私密</option>
          </select>
        ) : null}
        {showVis && onDelete ? (
          <button type="button" className="shelf-post-delete" onClick={onDelete}>删除</button>
        ) : null}
      </div>
    </article>
  );
}

export default function ShelfBookDetail({ bookId }: { bookId: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const flashToast = useToast();
  const requireLogin = useShelfLoginGate(flashToast);
  const [book, setBook] = useState<ShelfBookDetail | null>(null);
  const [tab, setTab] = useState<Tab>(() => {
    const t = search.get('tab');
    if (t === 'notes' || t === 'mine') return t;
    return 'reviews';
  });
  const [sort, setSort] = useState<'latest' | 'helpful'>('latest');
  const [posts, setPosts] = useState<ShelfPost[]>([]);
  const [stats, setStats] = useState({ reviews: 0, notes: 0 });
  const [loading, setLoading] = useState(true);
  const [writeReview, setWriteReview] = useState(false);
  const [hubPostId, setHubPostId] = useState<string | null>(null);
  const [hubAbstract, setHubAbstract] = useState<string | undefined>();

  const progress = useMemo(() => loadShelfBookProgress(bookId), [bookId]);

  useEffect(() => {
    setLoading(true);
    void getPlatformShelfBook(bookId)
      .then(setBook)
      .catch(() => flashToast('无法加载书目'))
      .finally(() => setLoading(false));
  }, [bookId, flashToast]);

  const reloadPosts = useCallback(() => {
    const kind = tab === 'reviews' ? 'review' : tab === 'notes' ? 'note' : undefined;
    void listShelfPosts(bookId, {
      kind: kind as 'review' | 'note' | undefined,
      mine: tab === 'mine',
      sort: tab === 'reviews' ? sort : 'latest',
    })
      .then((data) => {
        setPosts(data.items);
        setStats(data.stats);
      })
      .catch(() => flashToast('加载失败'));
  }, [bookId, tab, sort, flashToast]);

  useEffect(() => {
    reloadPosts();
  }, [reloadPosts]);

  const continueHref = readHref(
    bookId,
    progress?.sectionId,
    progress?.pageIndex,
  );

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

  const openPost = (post: ShelfPost) => {
    setHubAbstract(post.abstract || undefined);
    setHubPostId(post.id);
  };

  if (loading && !book) {
    return (
      <main className="shelf-detail-page">
        <PageBackBar href="/shelf" ariaLabel="返回书架" />
        <p className="muted" style={{ padding: 24 }}>加载中…</p>
      </main>
    );
  }

  return (
    <main className="shelf-detail-page">
      <PageBackBar href="/shelf" ariaLabel="返回书架" />
      <div className="shelf-detail-hero">
        <ShelfCoverPlate title={book?.title || ''} subtitle={book?.subtitle} size="detail" />
        <div className="shelf-detail-hero-text">
          <h1 className="shelf-detail-title">{book?.title}</h1>
          {book?.subtitle ? <p className="muted shelf-detail-sub">{book.subtitle}</p> : null}
          {progress?.sectionId ? (
            <p className="shelf-detail-progress muted">续读进度已保存</p>
          ) : null}
          <button type="button" className="btn shelf-detail-continue" onClick={() => router.push(continueHref)}>
            继续阅读 ›
          </button>
          <p className="shelf-detail-stats muted">
            {stats.notes} 条公开笔记 · {stats.reviews} 篇书评
          </p>
        </div>
      </div>

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

      {tab === 'reviews' ? (
        <div className="shelf-detail-sort">
          <button type="button" className={sort === 'latest' ? 'is-active' : ''} onClick={() => setSort('latest')}>最新</button>
          <button type="button" className={sort === 'helpful' ? 'is-active' : ''} onClick={() => setSort('helpful')}>有帮助</button>
        </div>
      ) : null}

      <div className="shelf-detail-list">
        {posts.length === 0 ? (
          <p className="muted shelf-detail-empty">
            {tab === 'reviews' ? '还没有书评，读完写几句也很好' : '暂无内容'}
          </p>
        ) : (
          posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onLike={() => void onLike(post)}
              onOpen={() => openPost(post)}
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

      <button type="button" className="shelf-detail-fab" aria-label="写书评" onClick={() => void onWriteReview()}>
        ✎
      </button>

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
