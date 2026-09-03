'use client';

import { formatShelfPostTime, type ShelfPost, type ShelfPostVisibility } from '@/lib/shelf_posts';

export default function ShelfPostCard({
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
    <article
      className="shelf-post-card card"
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      role="button"
      tabIndex={0}
    >
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
          <button type="button" className="shelf-post-delete" onClick={onDelete}>
            删除
          </button>
        ) : null}
      </div>
    </article>
  );
}
