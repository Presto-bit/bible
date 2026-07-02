// 经文想法（本地 JSON + 可选同步好友动态）。

import { api, effectiveId, getDisplayName, getUserName } from './api';

export type ThoughtRow = {
  id: string;
  ref: string;
  body: string;
  authorId: string;
  authorName: string;
  likesCount: number;
  likedBy: string[];
  isShared: boolean;
  createdAtMs: number;
};

const KEY = 'verse_thoughts_v1';

function userId(): string {
  if (typeof window === 'undefined') return 'me';
  return effectiveId() || 'me';
}

function userName(): string {
  if (typeof window === 'undefined') return '我';
  const name = getUserName().trim();
  if (name) return name;
  return getDisplayName();
}

function readAll(): ThoughtRow[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]') as ThoughtRow[];
  } catch {
    return [];
  }
}

function writeAll(rows: ThoughtRow[]) {
  localStorage.setItem(KEY, JSON.stringify(rows));
}

export function selectionRef(bookId: string, chapter: number, verses: number[]): string {
  const sel = [...verses].sort((a, b) => a - b);
  if (!sel.length) return `${bookId}.${chapter}`;
  if (sel[0] === sel[sel.length - 1]) return `${bookId}.${chapter}.${sel[0]}`;
  return `${bookId}.${chapter}.${sel[0]}-${sel[sel.length - 1]}`;
}

function verseFromRef(ref: string, bookId: string, chapter: number): number | null {
  const prefix = `${bookId}.${chapter}.`;
  if (!ref.startsWith(prefix)) return null;
  const tail = ref.split('.')[2] ?? '';
  const v = tail.includes('-') ? Number(tail.split('-')[0]) : Number(tail);
  return Number.isNaN(v) ? null : v;
}

export function thoughtsForChapter(bookId: string, chapter: number): Record<number, number> {
  const map: Record<number, number> = {};
  for (const t of readAll()) {
    const v = verseFromRef(t.ref, bookId, chapter);
    if (v != null) map[v] = (map[v] ?? 0) + 1;
  }
  return map;
}

/** 当前用户在章内各节的想法数（用于虚线标注）。 */
export function myThoughtsForChapter(bookId: string, chapter: number): Record<number, number> {
  const uid = userId();
  const map: Record<number, number> = {};
  for (const t of readAll()) {
    if (t.authorId !== uid) continue;
    const v = verseFromRef(t.ref, bookId, chapter);
    if (v != null) map[v] = (map[v] ?? 0) + 1;
  }
  return map;
}

export function myThoughtsForRef(ref: string): ThoughtRow[] {
  const uid = userId();
  return readAll()
    .filter((t) => t.ref === ref && t.authorId === uid)
    .sort((a, b) => b.createdAtMs - a.createdAtMs);
}

export function sortedThoughts(ref: string): ThoughtRow[] {
  const uid = userId();
  const rows = readAll().filter((t) => t.ref === ref);
  const mine = rows.filter((t) => t.authorId === uid).sort((a, b) => b.createdAtMs - a.createdAtMs);
  const others = rows
    .filter((t) => t.authorId !== uid)
    .sort((a, b) => b.likesCount - a.likesCount || b.createdAtMs - a.createdAtMs);
  return [...mine, ...others];
}

export function listAllThoughts(): ThoughtRow[] {
  return readAll().sort((a, b) => b.createdAtMs - a.createdAtMs);
}

export function addThought(ref: string, body: string): ThoughtRow {
  const row: ThoughtRow = {
    id: `t_${Date.now()}`,
    ref,
    body: body.trim(),
    authorId: userId(),
    authorName: userName(),
    likesCount: 0,
    likedBy: [],
    isShared: true,
    createdAtMs: Date.now(),
  };
  const all = readAll();
  all.push(row);
  writeAll(all);
  if (typeof window !== 'undefined') {
    void api.publishShare({ ref, body: row.body, kind: 'thought' }).catch(() => {});
  }
  return row;
}

export function toggleThoughtLike(id: string) {
  const uid = userId();
  const all = readAll();
  const i = all.findIndex((t) => t.id === id);
  if (i < 0) return;
  const liked = all[i].likedBy.includes(uid)
    ? all[i].likedBy.filter((x) => x !== uid)
    : [...all[i].likedBy, uid];
  all[i] = { ...all[i], likedBy: liked, likesCount: liked.length };
  writeAll(all);
}

export function isThoughtLiked(t: ThoughtRow): boolean {
  return t.likedBy.includes(userId());
}

export function deleteThought(id: string): boolean {
  const uid = userId();
  const all = readAll();
  const row = all.find((t) => t.id === id);
  if (!row || row.authorId !== uid) return false;
  writeAll(all.filter((t) => t.id !== id));
  return true;
}

export function updateThought(id: string, body: string): boolean {
  const uid = userId();
  const trimmed = body.trim();
  if (!trimmed) return false;
  const all = readAll();
  const i = all.findIndex((t) => t.id === id && t.authorId === uid);
  if (i < 0) return false;
  all[i] = { ...all[i], body: trimmed };
  writeAll(all);
  return true;
}
