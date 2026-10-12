'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/ToastProvider';

export type ManuscriptComment = {
  id: string;
  userId: string;
  displayName: string;
  body: string;
  createdAt?: string | null;
};

type Props = {
  topicId: string;
  pageKey: string;
  commentsRef?: React.RefObject<HTMLElement | null>;
  onScrollToComments?: () => void;
  chromeHidden?: boolean;
  shareBusy?: boolean;
  onShare: () => void;
};

function formatTime(iso?: string | null): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const d = new Date(t);
  const mm = `${d.getMonth() + 1}`.padStart(2, '0');
  const dd = `${d.getDate()}`.padStart(2, '0');
  const hh = `${d.getHours()}`.padStart(2, '0');
  const mi = `${d.getMinutes()}`.padStart(2, '0');
  return `${mm}-${dd} ${hh}:${mi}`;
}

export function ManuscriptPageEngagement({
  topicId,
  pageKey,
  commentsRef,
  onScrollToComments,
  chromeHidden,
  shareBusy,
  onShare,
}: Props) {
  const toast = useToast();
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [comments, setComments] = useState<ManuscriptComment[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setDraft('');
    void (async () => {
      try {
        const res = await api.knowledgePageEngagement(topicId, pageKey);
        if (cancelled) return;
        setLiked(Boolean(res.liked));
        setLikesCount(res.likesCount || 0);
        setComments(Array.isArray(res.comments) ? res.comments : []);
        setLoaded(true);
      } catch {
        if (!cancelled) {
          setLiked(false);
          setLikesCount(0);
          setComments([]);
          setLoaded(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [topicId, pageKey]);

  const onLike = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    const prevLiked = liked;
    const prevCount = likesCount;
    setLiked(!prevLiked);
    setLikesCount(Math.max(0, prevCount + (prevLiked ? -1 : 1)));
    try {
      const res = await api.toggleKnowledgePageLike(topicId, pageKey);
      setLiked(Boolean(res.liked));
      setLikesCount(res.likesCount || 0);
    } catch {
      setLiked(prevLiked);
      setLikesCount(prevCount);
      toast('点赞失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  }, [busy, liked, likesCount, pageKey, toast, topicId]);

  const onSubmit = useCallback(async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const res = await api.addKnowledgePageComment(topicId, pageKey, text);
      if (res.comment) {
        setComments((prev) => [...prev, res.comment]);
        setDraft('');
      }
    } catch {
      toast('评论失败，请登录后重试');
    } finally {
      setBusy(false);
    }
  }, [busy, draft, pageKey, toast, topicId]);

  return (
    <>
      <nav
        className={`manuscript-engage-dock${chromeHidden ? ' is-hidden' : ''}`}
        aria-label="互动"
      >
        <button type="button" className={liked ? 'is-on' : undefined} onClick={() => void onLike()}>
          <span aria-hidden>{liked ? '♥' : '♡'}</span>
          <em>赞{likesCount > 0 ? ` ${likesCount}` : ''}</em>
        </button>
        <button type="button" onClick={() => onScrollToComments?.()}>
          <span aria-hidden>💬</span>
          <em>评论{comments.length > 0 ? ` ${comments.length}` : ''}</em>
        </button>
        <button type="button" disabled={shareBusy} onClick={onShare}>
          <span aria-hidden>↑</span>
          <em>分享</em>
        </button>
      </nav>

      <section
        ref={commentsRef as React.RefObject<HTMLElement>}
        id="manuscript-comments"
        className="manuscript-comments"
        aria-label="评论"
      >
        <h3 className="manuscript-comments-title">
          评论{loaded ? ` ${comments.length}` : ''}
        </h3>
        {comments.length === 0 ? (
          <p className="manuscript-comments-empty muted">
            还没有评论，写下你的领受吧
          </p>
        ) : (
          <ul className="manuscript-comments-list">
            {comments.map((c) => (
              <li key={c.id} className="manuscript-comments-item">
                <div className="manuscript-comments-meta">
                  <strong>{c.displayName || '同路人'}</strong>
                  <time>{formatTime(c.createdAt)}</time>
                </div>
                <p>{c.body}</p>
              </li>
            ))}
          </ul>
        )}
        <div className="manuscript-comments-composer">
          <input
            className="search-input"
            value={draft}
            maxLength={500}
            placeholder="写评论…"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void onSubmit();
              }
            }}
          />
          <button
            type="button"
            className="btn"
            disabled={busy || !draft.trim()}
            onClick={() => void onSubmit()}
          >
            发送
          </button>
        </div>
      </section>
    </>
  );
}
