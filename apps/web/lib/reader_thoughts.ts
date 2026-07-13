// 经文想法（本地 JSON + 可选同步好友动态）。

import { api, effectiveId, getDisplayName, getUserName } from './api';
import { listNotes } from './notes';
import { userLsGet, userLsSet, userLsRemove, userPrefixedGet, userPrefixedSet, userPrefixedRemove } from './user_storage';

export type ThoughtVisibility = 'public' | 'friends' | 'private';

export type ThoughtRow = {
  id: string;
  ref: string;
  body: string;
  authorId: string;
  authorName: string;
  likesCount: number;
  likedBy: string[];
  /** @deprecated 使用 visibility */
  isShared?: boolean;
  visibility: ThoughtVisibility;
  createdAtMs: number;
};

const KEY = 'verse_thoughts_v2';
const LEGACY_KEY = 'verse_thoughts_v1';
const NOTES_MIGRATED_KEY = 'notes_migrated_to_thoughts_v2';
const VIS_PREF_KEY = 'thought_visibility_pref';
const DRAFT_PREFIX = 'thought_draft_v1:';

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

function normalizeVisibility(row: Partial<ThoughtRow>): ThoughtVisibility {
  if (row.visibility === 'public' || row.visibility === 'friends' || row.visibility === 'private') {
    return row.visibility;
  }
  if (row.isShared === false) return 'private';
  return 'public';
}

function readRaw(): ThoughtRow[] {
  migrateLegacyThoughts();
  try {
    const rows = JSON.parse(userLsGet(KEY) || '[]') as Partial<ThoughtRow>[];
    return rows.map((row) => ({
      ...row,
      visibility: normalizeVisibility(row),
      likesCount: row.likesCount ?? 0,
      likedBy: row.likedBy ?? [],
    })) as ThoughtRow[];
  } catch {
    return [];
  }
}

function readAll(): ThoughtRow[] {
  migrateNotesToThoughts();
  return readRaw();
}

function writeAll(rows: ThoughtRow[]) {
  userLsSet(KEY, JSON.stringify(rows));
}

function migrateLegacyThoughts() {
  if (typeof window === 'undefined') return;
  if (userLsGet(KEY)) return;
  try {
    const legacy = JSON.parse(userLsGet(LEGACY_KEY) || '[]') as Partial<ThoughtRow>[];
    if (!legacy.length) return;
    const next = legacy.map((row) => ({
      ...row,
      visibility: normalizeVisibility(row),
      likesCount: row.likesCount ?? 0,
      likedBy: row.likedBy ?? [],
    })) as ThoughtRow[];
    writeAll(next);
  } catch {
    /* ignore */
  }
}

function migrateNotesToThoughts() {
  if (typeof window === 'undefined') return;
  if (userLsGet(NOTES_MIGRATED_KEY)) return;
  const notes = listNotes();
  const all = readRaw();
  const existing = new Set(all.map((t) => `${t.ref}::${t.body.trim()}`));
  for (const note of notes) {
    if (!note.ref || !note.body.trim() || note.deleted) continue;
    const sig = `${note.ref}::${note.body.trim()}`;
    if (existing.has(sig)) continue;
    all.push({
      id: `m_${note.id}`,
      ref: note.ref,
      body: note.body.trim(),
      authorId: userId(),
      authorName: userName(),
      likesCount: 0,
      likedBy: [],
      visibility: 'private',
      createdAtMs: note.updatedAt || Date.now(),
    });
    existing.add(sig);
  }
  writeAll(all);
  userLsSet(NOTES_MIGRATED_KEY, '1');
}

export function visibilityLabel(v: ThoughtVisibility): string {
  if (v === 'public') return '公开';
  if (v === 'friends') return '共读';
  return '私密';
}

export function visibilityHint(v: ThoughtVisibility): string {
  if (v === 'public') return '读同一节经文的任何人都可见';
  if (v === 'friends') return '仅你的好友可见';
  return '仅自己可见';
}

export function getDefaultVisibility(context: 'normal' | 'mark' = 'normal'): ThoughtVisibility {
  if (context === 'mark') return 'private';
  if (typeof window === 'undefined') return 'public';
  const pref = userLsGet(VIS_PREF_KEY);
  if (pref === 'public' || pref === 'friends' || pref === 'private') return pref;
  return 'public';
}

export function rememberVisibility(v: ThoughtVisibility) {
  if (typeof window === 'undefined') return;
  userLsSet(VIS_PREF_KEY, v);
}

export function loadThoughtDraft(ref: string): { body: string; visibility: ThoughtVisibility } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = userPrefixedGet(DRAFT_PREFIX, ref);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { body?: string; visibility?: ThoughtVisibility };
    if (!parsed.body?.trim()) return null;
    return {
      body: parsed.body,
      visibility: parsed.visibility ?? getDefaultVisibility(),
    };
  } catch {
    return null;
  }
}

export function saveThoughtDraft(ref: string, body: string, visibility: ThoughtVisibility) {
  if (typeof window === 'undefined') return;
  const trimmed = body.trim();
  if (!trimmed) {
    userPrefixedRemove(DRAFT_PREFIX, ref);
    return;
  }
  userPrefixedSet(DRAFT_PREFIX, ref, JSON.stringify({ body: trimmed, visibility }));
}

export function clearThoughtDraft(ref: string) {
  if (typeof window === 'undefined') return;
  userPrefixedRemove(DRAFT_PREFIX, ref);
}

export function selectionRef(bookId: string, chapter: number, verses: number[]): string {
  const sel = [...verses].sort((a, b) => a - b);
  if (!sel.length) return `${bookId}.${chapter}`;
  if (sel[0] === sel[sel.length - 1]) return `${bookId}.${chapter}.${sel[0]}`;
  return `${bookId}.${chapter}.${sel[0]}-${sel[sel.length - 1]}`;
}

/** 想法 ref 覆盖的节号列表（支持 gen.1.3-5）。 */
export function versesFromRef(ref: string, bookId: string, chapter: number): number[] {
  if (ref === `${bookId}.${chapter}`) return [];
  const prefix = `${bookId}.${chapter}.`;
  if (!ref.startsWith(prefix)) return [];
  const tail = ref.slice(prefix.length);
  if (!tail) return [];
  if (tail.includes('-')) {
    const [rawA, rawB] = tail.split('-');
    const a = Number(rawA);
    const b = Number(rawB);
    if (Number.isNaN(a) || Number.isNaN(b)) return [];
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const out: number[] = [];
    for (let i = lo; i <= hi; i += 1) out.push(i);
    return out;
  }
  const v = Number(tail);
  return Number.isNaN(v) ? [] : [v];
}

function isVisibleToReader(t: ThoughtRow, uid: string): boolean {
  if (t.authorId === uid) return true;
  return t.visibility === 'public';
}

export function thoughtsAtVerse(bookId: string, chapter: number, verse: number): ThoughtRow[] {
  const uid = userId();
  return readAll().filter(
    (t) => isVisibleToReader(t, uid) && versesFromRef(t.ref, bookId, chapter).includes(verse),
  );
}

/** 打开某节想法列表时使用的 ref（优先精确节 ref）。 */
export function listRefForVerse(bookId: string, chapter: number, verse: number): string {
  const rows = thoughtsAtVerse(bookId, chapter, verse);
  const exact = `${bookId}.${chapter}.${verse}`;
  if (!rows.length) return exact;
  return rows.find((r) => r.ref === exact)?.ref ?? rows[0].ref;
}

/** 自己优先 → 点赞多 → 新发布 */
export function compareThoughtRows(a: ThoughtRow, b: ThoughtRow, uid: string): number {
  const aMine = a.authorId === uid ? 1 : 0;
  const bMine = b.authorId === uid ? 1 : 0;
  if (aMine !== bMine) return bMine - aMine;
  if (b.likesCount !== a.likesCount) return b.likesCount - a.likesCount;
  return b.createdAtMs - a.createdAtMs;
}

function sortThoughtRows(rows: ThoughtRow[], uid = userId()): ThoughtRow[] {
  return [...rows].sort((a, b) => compareThoughtRows(a, b, uid));
}

export function sortedThoughtsForVerse(bookId: string, chapter: number, verse: number): ThoughtRow[] {
  return sortThoughtRows(thoughtsAtVerse(bookId, chapter, verse));
}

export function thoughtsForChapter(bookId: string, chapter: number): Record<number, number> {
  const uid = userId();
  const map: Record<number, number> = {};
  for (const t of readAll()) {
    if (!isVisibleToReader(t, uid)) continue;
    for (const v of versesFromRef(t.ref, bookId, chapter)) {
      map[v] = (map[v] ?? 0) + 1;
    }
  }
  return map;
}

/** 当前用户在章内各节的想法数（用于虚线标注）。 */
export function myThoughtsForChapter(bookId: string, chapter: number): Record<number, number> {
  const uid = userId();
  const map: Record<number, number> = {};
  for (const t of readAll()) {
    if (t.authorId !== uid) continue;
    for (const v of versesFromRef(t.ref, bookId, chapter)) {
      map[v] = (map[v] ?? 0) + 1;
    }
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
  const rows = readAll().filter((t) => t.ref === ref && isVisibleToReader(t, uid));
  return sortThoughtRows(rows, uid);
}

export function listAllThoughts(): ThoughtRow[] {
  const uid = userId();
  return readAll()
    .filter((t) => t.authorId === uid)
    .sort((a, b) => b.createdAtMs - a.createdAtMs);
}

export function thoughtPreviewForRef(ref: string, maxLen = 80): string | undefined {
  const mine = myThoughtsForRef(ref);
  const body = mine[0]?.body?.trim();
  if (!body) return undefined;
  return body.length > maxLen ? `${body.slice(0, maxLen)}…` : body;
}

type AddThoughtOpts = {
  skipPublish?: boolean;
  createdAtMs?: number;
  id?: string;
};

export function addThought(
  ref: string,
  body: string,
  visibility: ThoughtVisibility = getDefaultVisibility(),
  opts?: AddThoughtOpts,
): ThoughtRow {
  const row: ThoughtRow = {
    id: opts?.id ?? `t_${Date.now()}`,
    ref,
    body: body.trim(),
    authorId: userId(),
    authorName: userName(),
    likesCount: 0,
    likedBy: [],
    visibility,
    createdAtMs: opts?.createdAtMs ?? Date.now(),
  };
  const all = readAll();
  all.push(row);
  writeAll(all);
  rememberVisibility(visibility);
  clearThoughtDraft(ref);
  if (!opts?.skipPublish && visibility !== 'private' && typeof window !== 'undefined') {
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

export function updateThought(
  id: string,
  body: string,
  visibility?: ThoughtVisibility,
): boolean {
  const uid = userId();
  const trimmed = body.trim();
  if (!trimmed) return false;
  const all = readAll();
  const i = all.findIndex((t) => t.id === id && t.authorId === uid);
  if (i < 0) return false;
  const nextVisibility = visibility ?? all[i].visibility;
  all[i] = { ...all[i], body: trimmed, visibility: nextVisibility };
  writeAll(all);
  rememberVisibility(nextVisibility);
  if (nextVisibility !== 'private' && typeof window !== 'undefined') {
    void api.publishShare({ ref: all[i].ref, body: trimmed, kind: 'thought' }).catch(() => {});
  }
  return true;
}

export function getThoughtById(id: string): ThoughtRow | null {
  const uid = userId();
  return readAll().find((t) => t.id === id && t.authorId === uid) ?? null;
}
