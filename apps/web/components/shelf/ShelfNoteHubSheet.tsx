'use client';

import { useCallback, useEffect, useState } from 'react';
import AppBodyPortal from '@/components/AppBodyPortal';
import { useKeyboardInset } from '@/components/reader/useKeyboardInset';
import { effectiveId } from '@/lib/api';
import {
  fetchShelfPost,
  formatShelfPostTime,
  replyShelfPost,
  toggleShelfPostLike,
  type ShelfPost,
} from '@/lib/shelf_posts';
import ShelfReplyComposer, { useShelfLoginGate } from '@/components/shelf/ShelfReplyComposer';
import { useToast } from '@/components/ui/ToastProvider';

type Props = {
  bookId: string;
  postId: string;
  abstract?: string;
  onClose: () => void;
  onChanged?: () => void;
};

export default function ShelfNoteHubSheet({
  bookId,
  postId,
  abstract,
  onClose,
  onChanged,
}: Props) {
  const flashToast = useToast();
  const requireLogin = useShelfLoginGate(flashToast);
  const { inset: kbInset, viewportHeight } = useKeyboardInset();
  const [post, setPost] = useState<ShelfPost | null>(null);
  const [loading, setLoading] = useState(true);
  const sheetH = viewportHeight
    ? `${Math.min(Math.round(viewportHeight * 0.8), viewportHeight - 8)}px`
    : '80dvh';

  const reload = useCallback(() => {
    setLoading(true);
    void fetchShelfPost(bookId, postId)
      .then(setPost)
      .catch(() => flashToast('加载失败'))
      .finally(() => setLoading(false));
  }, [bookId, postId, flashToast]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const onLike = async () => {
    if (!(await requireLogin())) return;
    try {
      const r = await toggleShelfPostLike(bookId, postId);
      setPost((p) => (p ? { ...p, liked: r.liked, likes_count: r.likes_count } : p));
      onChanged?.();
    } catch {
      flashToast('操作失败');
    }
  };

  const onReply = async (body: string) => {
    if (!(await requireLogin())) return;
    try {
      await replyShelfPost(bookId, postId, body);
      reload();
      onChanged?.();
    } catch {
      flashToast('回复失败');
    }
  };

  const mine = post && post.user_id === effectiveId();

  return (
    <AppBodyPortal onTabAway={onClose}>
      <div
        className="sheet-backdrop shelf-note-hub-backdrop"
        onClick={onClose}
        style={{ paddingBottom: kbInset }}
      >
        <div
          className="sheet card shelf-note-hub-sheet"
          style={{ height: sheetH, maxHeight: sheetH }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="half-sheet-grab" aria-hidden />
          <div className="shelf-note-hub-head">
            <strong>公开笔记</strong>
            <button type="button" className="icon-btn" aria-label="关闭" onClick={onClose}>✕</button>
          </div>

          {loading || !post ? (
            <p className="muted shelf-note-hub-loading">加载中…</p>
          ) : (
            <>
              <div className="shelf-note-hub-scroll">
                {(abstract || post.abstract) ? (
                  <blockquote className="shelf-note-hub-quote">
                    {abstract || post.abstract}
                  </blockquote>
                ) : null}
                <div className="shelf-note-hub-post">
                  <div className="shelf-post-meta">
                    <span>{post.author.name}</span>
                    <span className="muted">{formatShelfPostTime(post.created_at)}</span>
                    {mine ? <span className="shelf-post-badge">我的</span> : null}
                  </div>
                  <p className="shelf-post-body">{post.body}</p>
                  <div className="shelf-post-actions">
                    <button type="button" className={`shelf-post-like${post.liked ? ' is-liked' : ''}`} onClick={() => void onLike()}>
                      ♡ {post.likes_count > 0 ? post.likes_count : '赞'}
                    </button>
                  </div>
                </div>

                {post.replies && post.replies.length > 0 ? (
                  <div className="shelf-post-replies">
                    <p className="shelf-post-replies-label">回复 ({post.replies.length})</p>
                    {post.replies.map((r) => (
                      <div key={r.id} className="shelf-post-reply">
                        <div className="shelf-post-meta">
                          <span>{r.author.name}</span>
                          <span className="muted">{formatShelfPostTime(r.created_at)}</span>
                        </div>
                        <p>{r.body}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
              <ShelfReplyComposer onSubmit={onReply} />
            </>
          )}
        </div>
      </div>
    </AppBodyPortal>
  );
}
