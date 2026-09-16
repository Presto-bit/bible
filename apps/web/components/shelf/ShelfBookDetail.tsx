'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import PageBackBar from '@/components/PageBackBar';
import ShelfCoverPlate from '@/components/shelf/ShelfCoverPlate';
import ShelfPostCard from '@/components/shelf/ShelfPostCard';
import { useToast } from '@/components/ui/ToastProvider';
import {
  getPlatformShelfBook,
  clearShelfBookFinished,
  loadShelfBookProgress,
  shelfCoverUrl,
  type ShelfBookDetail,
} from '@/lib/shelf_api';
import {
  buildShelfCheckinRef,
  formatShelfCheckinLabel,
  rememberShelfRefLabel,
} from '@/lib/shelf_checkin';
import { buildShelfTocGroups, resolveSectionId, shelfTocDisplayTitle } from '@/lib/shelf_toc';
import {
  shelfBookProgressRatio,
  shelfBookProgressSummary,
  shelfBookTypeMeta,
} from '@/lib/shelf_library';
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
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';
import { navigateAppHref } from '@/lib/pwa_tab_nav';

const ShelfPostWriteSheet = dynamic(
  () => import('@/components/shelf/ShelfPostWriteSheet'),
  { ssr: false },
);
const ShelfNoteHubSheet = dynamic(
  () => import('@/components/shelf/ShelfNoteHubSheet'),
  { ssr: false },
);
const ShelfAppendLessonSheet = dynamic(
  () => import('@/components/shelf/ShelfAppendLessonSheet'),
  { ssr: false },
);
const ShelfCheckinSheet = dynamic(
  () => import('@/components/shelf/ShelfCheckinSheet'),
  { ssr: false },
);
const ShelfLibrarySheet = dynamic(
  () => import('@/components/shelf/ShelfLibrarySheet'),
  { ssr: false },
);
const ShelfBookManageSheet = dynamic(
  () => import('@/components/shelf/ShelfBookManageSheet'),
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
  const [appendOpen, setAppendOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [moveGroupOpen, setMoveGroupOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [tocExpanded, setTocExpanded] = useState(false);
  const [blurbExpanded, setBlurbExpanded] = useState(false);

  const progress = useMemo(() => loadShelfBookProgress(bookId), [bookId]);
  const finishedCelebration = search.get('finished') === '1' || Boolean(progress?.finished);

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
  const coverUrl = book ? shelfCoverUrl(bookId, book.cover_storage_key) : null;
  const tocGroups = useMemo(() => {
    if (!book) return [];
    return buildShelfTocGroups(book.toc, book.book_type);
  }, [book]);

  const tocFlat = useMemo(() => {
    if (!book) return [];
    const sections = book.sections ?? [];
    return tocGroups
      .flatMap((group) => group.items)
      .map((item) => ({
        id: resolveSectionId(item, sections) || item.section_id || item.id,
        title: shelfTocDisplayTitle(item),
        level: item.level,
        isUnit: item.level === 1 && !item.section_id,
      }))
      .filter((item) => Boolean(item.id) || item.isUnit);
  }, [book, tocGroups]);

  const tocPreview = tocFlat.filter((item) => !item.isUnit).slice(0, 5);
  const totalSections = tocFlat.filter((item) => !item.isUnit).length;
  const progressRatio = shelfBookProgressRatio(bookId);
  const progressSummary = book
    ? shelfBookProgressSummary(bookId, book.sections)
    : null;
  const typeMeta = book ? shelfBookTypeMeta(book) : null;

  useEdgeSwipeBack({ href: '/shelf', preferHistoryBack: true });

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
        <PageBackBar href="/shelf" label="书架" ariaLabel="返回书架" />
        <p className="muted shelf-detail-loading">加载中…</p>
      </main>
    );
  }

  if (bookErr && !book) {
    return (
      <main className="shelf-detail-page">
        <PageBackBar href="/shelf" label="书架" ariaLabel="返回书架" />
        <p className="muted shelf-detail-loading">{bookErr}</p>
      </main>
    );
  }

  return (
    <main className="shelf-detail-page">
      <PageBackBar href="/shelf" label="书架" ariaLabel="返回书架" />

      {finishedCelebration ? (
        <section className="shelf-detail-finished-banner" aria-live="polite">
          <p className="shelf-detail-finished-title">读完了</p>
          <p className="shelf-detail-finished-sub muted">
            《{book?.title}》已读完，写几句感受，或看看大家的书评
          </p>
          <div className="shelf-detail-finished-actions">
            <button type="button" className="btn primary" onClick={() => void onWriteReview()}>
              写书评
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                clearShelfBookFinished(bookId);
                navigateAppHref(continueHref, router);
              }}
            >
              再读一遍
            </button>
          </div>
        </section>
      ) : null}

      <section className="shelf-detail-hero">
        <ShelfCoverPlate title={book?.title || ''} size="detail" coverUrl={coverUrl} />
        <h1 className="shelf-detail-title">{book?.title}</h1>
        {book?.author ? <p className="shelf-detail-author muted">{book.author}</p> : null}
        {typeMeta || progressSummary ? (
          <p className="shelf-detail-meta muted">
            {[typeMeta, progressSummary].filter(Boolean).join(' · ')}
          </p>
        ) : null}
        {progressRatio != null && progressRatio > 0 && !progress?.finished ? (
          <div className="shelf-detail-progress" aria-hidden>
            <div
              className="shelf-detail-progress-fill"
              style={{ width: `${Math.round(progressRatio * 100)}%` }}
            />
          </div>
        ) : null}
        {book?.subtitle ? (
          <div className={`shelf-detail-blurb${blurbExpanded ? ' is-expanded' : ''}`}>
            <p className="shelf-detail-sub muted">{book.subtitle}</p>
            {book.subtitle.length > 72 ? (
              <button
                type="button"
                className="shelf-detail-blurb-toggle"
                onClick={() => setBlurbExpanded((v) => !v)}
              >
                {blurbExpanded ? '收起' : '展开'}
              </button>
            ) : null}
          </div>
        ) : null}
        {book?.book_type === 'collection' && (book.section_count ?? 0) === 0 ? (
          <p className="shelf-detail-empty-collection muted">
            合集还是空的，先添加第一份资料吧。
          </p>
        ) : null}
        <button
          type="button"
          className="btn primary shelf-detail-continue"
          onClick={() => {
            clearShelfBookFinished(bookId);
            navigateAppHref(continueHref, router);
          }}
        >
          {finishedCelebration ? '重新阅读' : progress?.sectionId ? '继续阅读' : '开始阅读'}
        </button>
        {book?.book_type === 'collection' && book.can_edit && (book.section_count ?? 0) === 0 ? (
          <button
            type="button"
            className="btn ghost shelf-detail-add-material"
            onClick={() => setAppendOpen(true)}
          >
            添加资料
          </button>
        ) : null}
        <p className="shelf-detail-stats muted">
          {stats.reviews} 篇书评 · {stats.notes} 条公开笔记
        </p>
        <div className="shelf-detail-secondary">
          <button type="button" className="shelf-detail-link" onClick={() => setMoveGroupOpen(true)}>
            移到分组
          </button>
          <span className="shelf-detail-link-sep" aria-hidden>
            ·
          </span>
          <button type="button" className="shelf-detail-link" onClick={() => setShareOpen(true)}>
            分享到群
          </button>
          {book?.can_edit ? (
            <>
              <span className="shelf-detail-link-sep" aria-hidden>
                ·
              </span>
              <button type="button" className="shelf-detail-link" onClick={() => setManageOpen(true)}>
                管理
              </button>
            </>
          ) : null}
        </div>
      </section>

      {tocPreview.length > 0 ? (
        <section
          className={`shelf-detail-toc${tocExpanded ? ' is-expanded' : ''}`}
          aria-label="目录"
        >
          <h2 className="shelf-detail-toc-title">{tocExpanded ? '全部目录' : '目录预览'}</h2>
          {tocExpanded ? (
            <div className="shelf-detail-toc-groups">
              {tocGroups.map((group) => (
                <div key={group.key} className="shelf-detail-toc-group">
                  {tocGroups.length > 1 && group.label ? (
                    <p className="shelf-detail-toc-group-label">{group.label}</p>
                  ) : null}
                  <ol className="shelf-detail-toc-list">
                    {group.items.map((item) => {
                      const sections = book?.sections ?? [];
                      const sid = resolveSectionId(item, sections) || item.section_id || item.id;
                      if (item.level === 1 && !item.section_id) {
                        return (
                          <li key={item.id} className="shelf-detail-toc-unit">
                            {shelfTocDisplayTitle(item)}
                          </li>
                        );
                      }
                      if (!sid) return null;
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            className={`shelf-detail-toc-item level-${item.level}`}
                            onClick={() => {
                              clearShelfBookFinished(bookId);
                              navigateAppHref(readHref(bookId, sid), router);
                            }}
                          >
                            {shelfTocDisplayTitle(item)}
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              ))}
            </div>
          ) : (
            <ol className="shelf-detail-toc-list">
              {tocPreview.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="shelf-detail-toc-item"
                    onClick={() => {
                      clearShelfBookFinished(bookId);
                      navigateAppHref(readHref(bookId, item.id), router);
                    }}
                  >
                    {item.title}
                  </button>
                </li>
              ))}
            </ol>
          )}
          {totalSections > tocPreview.length ? (
            <button
              type="button"
              className="shelf-detail-toc-more btn ghost"
              onClick={() => setTocExpanded((v) => !v)}
            >
              {tocExpanded ? '收起目录' : `查看全部目录（${totalSections} 节）`}
            </button>
          ) : null}
        </section>
      ) : null}

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

      {appendOpen && book ? (
        <ShelfAppendLessonSheet
          bookId={bookId}
          bookTitle={book.title}
          onClose={() => setAppendOpen(false)}
          onAdded={() => {
            void getPlatformShelfBook(bookId).then(setBook);
          }}
        />
      ) : null}

      {shareOpen && book ? (
        <ShelfCheckinSheet
          bookId={bookId}
          bookTitle={book.title}
          onClose={() => setShareOpen(false)}
        />
      ) : null}

      {moveGroupOpen && book ? (
        <ShelfLibrarySheet
          mode="move_book"
          book={book}
          onClose={() => setMoveGroupOpen(false)}
          onChanged={() => setMoveGroupOpen(false)}
        />
      ) : null}

      {manageOpen && book ? (
        <ShelfBookManageSheet
          book={book}
          onClose={() => setManageOpen(false)}
          onChanged={() => {
            void getPlatformShelfBook(bookId).then(setBook);
          }}
        />
      ) : null}
    </main>
  );
}
