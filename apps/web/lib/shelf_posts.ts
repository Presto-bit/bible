/** 书架书评 / 公开笔记 API */
import { authed, getJson } from './api_core';

export type ShelfPostVisibility = 'public' | 'friends' | 'private';
export type ShelfPostKind = 'review' | 'note';

export type ShelfPostAuthor = {
  id: string;
  name: string;
};

export type ShelfPostReply = {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  created_at: string | null;
  author: ShelfPostAuthor;
};

export type ShelfPost = {
  id: string;
  book_id: string;
  user_id: string;
  kind: ShelfPostKind;
  ref: string;
  body: string;
  abstract: string | null;
  visibility: ShelfPostVisibility;
  section_id: string | null;
  page_index: number | null;
  span_start: number | null;
  span_end: number | null;
  read_status: 'reading' | 'finished' | null;
  likes_count: number;
  replies_count: number;
  created_at: string | null;
  updated_at: string | null;
  liked?: boolean;
  author: ShelfPostAuthor;
  replies?: ShelfPostReply[];
};

export type ShelfPostList = {
  items: ShelfPost[];
  stats: { reviews: number; notes: number };
};

const VIS_PREF = 'shelf_post_visibility_pref';

export function shelfVisibilityLabel(v: ShelfPostVisibility): string {
  if (v === 'public') return '公开';
  if (v === 'friends') return '共读';
  return '私密';
}

export function shelfVisibilityHint(v: ShelfPostVisibility): string {
  if (v === 'public') return '将出现在本书详情页，公开笔记会在正文显示虚线标记';
  if (v === 'friends') return '仅你的好友可见';
  return '仅自己可见';
}

export function getShelfDefaultVisibility(): ShelfPostVisibility {
  if (typeof window === 'undefined') return 'public';
  try {
    const raw = localStorage.getItem(VIS_PREF);
    if (raw === 'public' || raw === 'friends' || raw === 'private') return raw;
  } catch {
    /* ignore */
  }
  return 'public';
}

export function rememberShelfVisibility(v: ShelfPostVisibility) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(VIS_PREF, v);
  } catch {
    /* ignore */
  }
}

export function listShelfPosts(
  bookId: string,
  opts?: {
    kind?: ShelfPostKind;
    sectionId?: string;
    mine?: boolean;
    sort?: 'latest' | 'helpful';
  },
): Promise<ShelfPostList> {
  const q = new URLSearchParams();
  if (opts?.kind) q.set('kind', opts.kind);
  if (opts?.sectionId) q.set('section_id', opts.sectionId);
  if (opts?.mine) q.set('mine', 'true');
  if (opts?.sort) q.set('sort', opts.sort);
  const qs = q.toString();
  return getJson<ShelfPostList>(
    `/shelf/platform/${encodeURIComponent(bookId)}/posts${qs ? `?${qs}` : ''}`,
  );
}

export function fetchSectionPublicNotes(
  bookId: string,
  sectionId: string,
): Promise<{ items: ShelfPost[] }> {
  return getJson<{ items: ShelfPost[] }>(
    `/shelf/platform/${encodeURIComponent(bookId)}/posts/section/${encodeURIComponent(sectionId)}/public-notes`,
  );
}

export function fetchShelfPost(bookId: string, postId: string): Promise<ShelfPost> {
  return getJson<ShelfPost>(
    `/shelf/platform/${encodeURIComponent(bookId)}/posts/${encodeURIComponent(postId)}`,
  );
}

export function createShelfPost(
  bookId: string,
  body: {
    kind: ShelfPostKind;
    ref: string;
    body: string;
    abstract?: string;
    visibility?: ShelfPostVisibility;
    section_id?: string;
    page_index?: number;
    span_start?: number;
    span_end?: number;
    read_status?: 'reading' | 'finished';
  },
): Promise<ShelfPost> {
  return authed<ShelfPost>(
    `/shelf/platform/${encodeURIComponent(bookId)}/posts`,
    { method: 'POST', body },
  );
}

export function replyShelfPost(
  bookId: string,
  postId: string,
  body: string,
): Promise<ShelfPostReply> {
  return authed<ShelfPostReply>(
    `/shelf/platform/${encodeURIComponent(bookId)}/posts/${encodeURIComponent(postId)}/replies`,
    { method: 'POST', body: { body } },
  );
}

export function toggleShelfPostLike(
  bookId: string,
  postId: string,
): Promise<{ liked: boolean; likes_count: number }> {
  return authed<{ liked: boolean; likes_count: number }>(
    `/shelf/platform/${encodeURIComponent(bookId)}/posts/${encodeURIComponent(postId)}/like`,
    { method: 'POST', body: {} },
  );
}

export function updateShelfPostVisibility(
  bookId: string,
  postId: string,
  visibility: ShelfPostVisibility,
): Promise<ShelfPost> {
  return authed<ShelfPost>(
    `/shelf/platform/${encodeURIComponent(bookId)}/posts/${encodeURIComponent(postId)}/visibility`,
    { method: 'PATCH', body: { visibility } },
  );
}

export function deleteShelfPost(bookId: string, postId: string): Promise<{ ok: boolean }> {
  return authed<{ ok: boolean }>(
    `/shelf/platform/${encodeURIComponent(bookId)}/posts/${encodeURIComponent(postId)}`,
    { method: 'DELETE' },
  );
}

export function formatShelfPostTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
