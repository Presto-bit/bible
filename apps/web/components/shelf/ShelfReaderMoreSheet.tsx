'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import AppBodyPortal from '@/components/AppBodyPortal';
import ShelfPostCard from '@/components/shelf/ShelfPostCard';
import { useToast } from '@/components/ui/ToastProvider';
import { friendlyError } from '@/lib/friendly_error';
import { useShelfLoginGate } from '@/components/shelf/ShelfReplyComposer';
import { buildShelfCheckinRef, formatShelfCheckinLabel, rememberShelfRefLabel } from '@/lib/shelf_checkin';
import {
  createShelfPost,
  deleteShelfPost,
  getShelfDefaultVisibility,
  listShelfPosts,
  toggleShelfPostLike,
  updateShelfPostVisibility,
  type ShelfPost,
} from '@/lib/shelf_posts';
import { shellTapProps } from '@/lib/shell_tap';
import ShelfInlineComposer from '@/components/shelf/ShelfInlineComposer';

const ShelfNoteHubSheet = dynamic(
  () => import('@/components/shelf/ShelfNoteHubSheet'),
  { ssr: false },
);

type Tab = 'chapter' | 'notes' | 'hot' | 'mine';

export default function ShelfReaderMoreSheet({
  bookId,
  bookTitle,
  sectionTitle,
  sectionId,
  pageIndex = 0,
  onClose,
}: {
  bookId: string;
  bookTitle: string;
  sectionTitle?: string;
  sectionId?: string | null;
  pageIndex?: number;
  onClose: () => void;
}) {
  const flashToast = useToast();
  const requireLogin = useShelfLoginGate(flashToast);
  const [tab, setTab] = useState<Tab>('chapter');
  const [posts, setPosts] = useState<ShelfPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [hubPostId, setHubPostId] = useState<string | null>(null);
  const [hubAbstract, setHubAbstract] = useState<string | undefined>();
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const reloadPosts = useCallback(() => {
    if (!sectionId && tab !== 'hot') {
      setPosts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const kind = tab === 'chapter' ? 'review' : tab === 'notes' ? 'note' : undefined;
    void listShelfPosts(bookId, {
      kind: kind as 'review' | 'note' | undefined,
      sectionId: tab === 'hot' ? undefined : sectionId ?? undefined,
      mine: tab === 'mine',
      sort: tab === 'hot' ? 'helpful' : 'latest',
    })
      .then((data) => setPosts(data.items))
      .catch((e) => flashToast(friendlyError(e, '加载失败')))
      .finally(() => setLoading(false));
  }, [bookId, tab, sectionId, flashToast]);

  useEffect(() => {
    reloadPosts();
  }, [reloadPosts]);

  const submitChapterComment = async () => {
    const body = draft.trim();
    if (!body || !sectionId) return;
    if (!(await requireLogin())) return;
    setSubmitting(true);
    const ref = buildShelfCheckinRef(bookId, sectionId, pageIndex);
    rememberShelfRefLabel(ref, formatShelfCheckinLabel(bookTitle, sectionTitle || ''));
    try {
      await createShelfPost(bookId, {
        kind: 'review',
        ref,
        body,
        visibility: getShelfDefaultVisibility(),
        section_id: sectionId,
        page_index: pageIndex,
      });
      setDraft('');
      flashToast('已发布');
      reloadPosts();
    } catch {
      flashToast('发布失败');
    } finally {
      setSubmitting(false);
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

  const emptyHint = (() => {
    if (tab === 'chapter') return '本章还没有评论，写下第一句吧';
    if (tab === 'notes') return '本章暂无公开笔记，划选正文可写笔记';
    if (tab === 'hot') return '还没有热门评论';
    return '暂无内容';
  })();

  return (
    <AppBodyPortal onTabAway={onClose}>
      <div className="shelf-sheet-backdrop" onClick={onClose} role="presentation" />
      <div className="shelf-comments-sheet" role="dialog" aria-modal="true" aria-label="评论">
        <div className="shelf-comments-grab" aria-hidden />
        <div className="shelf-comments-head">
          <div className="shelf-comments-head-text">
            <strong className="shelf-comments-title">{sectionTitle || bookTitle}</strong>
            {sectionTitle ? <span className="shelf-comments-sub muted">{bookTitle}</span> : null}
          </div>
          <button type="button" className="icon-btn" aria-label="关闭" {...shellTapProps({ onTap: onClose })}>
            ✕
          </button>
        </div>
        <div className="shelf-comments-tabs" role="tablist">
          {(
            [
              ['chapter', '本章评论'],
              ['notes', '公开笔记'],
              ['hot', '热门'],
              ['mine', '我的'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`shelf-comments-tab${tab === id ? ' is-active' : ''}`}
              {...shellTapProps({ onTap: () => setTab(id) })}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="shelf-comments-body">
          {loading ? <p className="muted shelf-comments-empty">加载中…</p> : null}
          {!loading && posts.length === 0 ? (
            <p className="muted shelf-comments-empty">{emptyHint}</p>
          ) : null}
          {!loading
            ? posts.map((post) => (
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
            : null}
        </div>
        {tab === 'chapter' && sectionId ? (
          <div className="shelf-composer-footer">
            <ShelfInlineComposer
              value={draft}
              onChange={setDraft}
              onSubmit={submitChapterComment}
              placeholder="写下对本章的想法…"
              maxLength={2000}
              submitLabel="发送"
              busy={submitting}
              rows={2}
              inputRef={inputRef}
            />
          </div>
        ) : null}
      </div>
      {hubPostId ? (
        <ShelfNoteHubSheet
          bookId={bookId}
          postId={hubPostId}
          abstract={hubAbstract}
          onClose={() => setHubPostId(null)}
          onChanged={reloadPosts}
        />
      ) : null}
    </AppBodyPortal>
  );
}
