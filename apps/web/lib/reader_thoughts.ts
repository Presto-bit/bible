// 经文想法（本地 JSON）。

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
const USER_KEY = 'presto_user_id';

function userId(): string {
  if (typeof window === 'undefined') return 'me';
  let id = localStorage.getItem(USER_KEY);
  if (!id) {
    id = `u_${Date.now()}`;
    localStorage.setItem(USER_KEY, id);
  }
  return id;
}

function userName(): string {
  if (typeof window === 'undefined') return '我';
  return localStorage.getItem('onboarding_name') || '我';
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

export function thoughtsForChapter(bookId: string, chapter: number): Record<number, number> {
  const prefix = `${bookId}.${chapter}.`;
  const map: Record<number, number> = {};
  for (const t of readAll()) {
    if (!t.ref.startsWith(prefix)) continue;
    const tail = t.ref.split('.')[2] ?? '';
    const v = tail.includes('-') ? Number(tail.split('-')[0]) : Number(tail);
    if (!Number.isNaN(v)) map[v] = (map[v] ?? 0) + 1;
  }
  return map;
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

export { userId };
