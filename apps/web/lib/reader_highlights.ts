import { enqueueHighlight } from './highlight_sync';
import { parseMarkRef, selectionRef as buildSelectionRef, syncRef } from './mark_ref';
import { touchMarkMeta } from './mark_stats';
import { unbindMarkRef } from './mark_notes';
import { userLsGet, userLsRemove, userLsSet } from './user_storage';

export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink' | 'orange';

/** 划线 Mark：仅颜色底纹，语义见 mark_semantics.ts */
export type HighlightMark = { color: HighlightColor };

const HL_KEY = 'reader_highlights_v2';
const LEGACY_HL_KEY = 'reader_highlights_v1';
const LEGACY_STYLE_KEY = 'reader_highlight_styles_v1';

function migrateLegacy(): Record<string, HighlightMark> {
  if (typeof window === 'undefined') return {};
  try {
    const legacy = JSON.parse(
      userLsGet(LEGACY_HL_KEY) || '{}',
    ) as Record<string, HighlightColor>;
    if (!Object.keys(legacy).length) return {};
    const map: Record<string, HighlightMark> = {};
    for (const [ref, color] of Object.entries(legacy)) {
      map[ref] = { color };
      touchMarkMeta(ref);
    }
    userLsSet(HL_KEY, JSON.stringify(map));
    userLsRemove(LEGACY_HL_KEY);
    userLsRemove(LEGACY_STYLE_KEY);
    return map;
  } catch {
    return {};
  }
}

export function getHighlightMap(): Record<string, HighlightMark> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = userLsGet(HL_KEY);
    if (!raw) return migrateLegacy();
    return JSON.parse(raw) as Record<string, HighlightMark>;
  } catch {
    return {};
  }
}

function writeMap(map: Record<string, HighlightMark>) {
  userLsSet(HL_KEY, JSON.stringify(map));
}

export function selectionRef(
  bookId: string,
  chapter: number,
  verses: number[],
  span?: { start: number; end: number } | null,
): string {
  return buildSelectionRef(bookId, chapter, verses, span);
}

export function findHighlightStorageRef(
  bookId: string,
  chapter: number,
  verses: number[],
  map?: Record<string, HighlightMark>,
  span?: { start: number; end: number } | null,
): string | null {
  const hl = map ?? getHighlightMap();
  const sel = [...verses].sort((a, b) => a - b);
  if (!sel.length) return null;

  const selRef = selectionRef(bookId, chapter, sel, span);
  if (hl[selRef]) return selRef;

  for (const v of sel) {
    const single = `${bookId}.${chapter}.${v}`;
    if (hl[single]) return single;
  }

  const min = sel[0];
  const max = sel[sel.length - 1];

  for (const ref of Object.keys(hl)) {
    const p = parseMarkRef(ref);
    if (!p || p.bookId !== bookId || p.chapter !== chapter) continue;
    if (p.verseStart === min && (p.verseEnd ?? p.verseStart) === max) return ref;
  }

  for (const ref of Object.keys(hl)) {
    const p = parseMarkRef(ref);
    if (!p || p.bookId !== bookId || p.chapter !== chapter) continue;
    const start = p.verseStart;
    const end = p.verseEnd ?? p.verseStart;
    if (start == null || end == null) continue;
    if (start <= min && end >= max) return ref;
  }

  return null;
}

export function removeHighlight(ref: string): boolean {
  const map = getHighlightMap();
  if (!(ref in map)) return false;
  const prevColor = map[ref].color;
  delete map[ref];
  writeMap(map);
  unbindMarkRef(ref);
  enqueueHighlight(syncRef(ref), prevColor, true);
  return true;
}

export function setHighlight(ref: string, color: HighlightColor) {
  const map = getHighlightMap();
  map[ref] = { color };
  writeMap(map);
  touchMarkMeta(ref);
  enqueueHighlight(syncRef(ref), color, false);
}

/** 微信读书式：点色即应用；再点同色删除。 */
export function pickHighlightColor(
  bookId: string,
  chapter: number,
  verses: number[],
  color: HighlightColor,
  span?: { start: number; end: number } | null,
): boolean {
  const sorted = [...verses].sort((a, b) => a - b);
  const targetRef = selectionRef(bookId, chapter, sorted, span);
  const map = getHighlightMap();
  const existingRef = findHighlightStorageRef(bookId, chapter, sorted, map, span);

  if (existingRef) {
    const mark = map[existingRef];
    if (mark.color === color) {
      removeHighlight(existingRef);
      return false;
    }
    if (existingRef !== targetRef) removeHighlight(existingRef);
  }

  setHighlight(targetRef, color);
  return true;
}

export function clearHighlightForSelection(
  bookId: string,
  chapter: number,
  verses: number[],
  span?: { start: number; end: number } | null,
): boolean {
  const ref = findHighlightStorageRef(bookId, chapter, verses, undefined, span);
  if (!ref) return false;
  return removeHighlight(ref);
}

export function markForVerse(
  map: Record<string, HighlightMark>,
  bookId: string,
  chapter: number,
  verse: number,
): { mark: HighlightMark; ref: string; span?: { start: number; end: number } } | null {
  const exact = map[`${bookId}.${chapter}.${verse}`];
  if (exact) return { mark: exact, ref: `${bookId}.${chapter}.${verse}` };

  for (const [ref, mark] of Object.entries(map)) {
    const p = parseMarkRef(ref);
    if (!p || p.bookId !== bookId || p.chapter !== chapter) continue;
    const start = p.verseStart;
    const end = p.verseEnd ?? p.verseStart;
    if (start == null || end == null) continue;
    if (verse >= start && verse <= end) {
      const span =
        p.spanStart != null && p.spanEnd != null
          ? { start: p.spanStart, end: p.spanEnd }
          : undefined;
      return { mark, ref, span };
    }
  }
  return null;
}

export function listHighlightRefs(): { ref: string; mark: HighlightMark }[] {
  const map = getHighlightMap();
  return Object.entries(map)
    .map(([ref, mark]) => ({ ref, mark }))
    .sort((a, b) => a.ref.localeCompare(b.ref));
}

export function highlightCount(): number {
  return Object.keys(getHighlightMap()).length;
}

export function highlightColorCount(): number {
  const colors = new Set<string>();
  for (const mark of Object.values(getHighlightMap())) colors.add(mark.color);
  return colors.size;
}

export function highlightClass(mark: HighlightMark | null): string {
  if (!mark) return '';
  return `verse-mark verse-mark-color verse-mark-${mark.color}`;
}

// 边缘批注（旧 API，保留兼容 → 请用 mark_notes）
const NOTE_KEY = 'reader_margin_notes_v1';

export function getMarginNotes(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(userLsGet(NOTE_KEY) || '{}');
  } catch {
    return {};
  }
}

export function setMarginNote(ref: string, text: string) {
  const m = getMarginNotes();
  if (text.trim()) m[ref] = text.trim();
  else delete m[ref];
  userLsSet(NOTE_KEY, JSON.stringify(m));
}

/** @deprecated 样式已移除，始终返回 color */
export type HighlightStyleKey = 'color';

export function getHighlights(): Record<string, HighlightColor> {
  const map = getHighlightMap();
  const out: Record<string, HighlightColor> = {};
  for (const [ref, mark] of Object.entries(map)) out[ref] = mark.color;
  return out;
}

export function getHighlightStyles(): Record<string, HighlightStyleKey> {
  const map = getHighlightMap();
  const out: Record<string, HighlightStyleKey> = {};
  for (const ref of Object.keys(map)) out[ref] = 'color';
  return out;
}

export function toggleHighlight(
  ref: string,
  color: HighlightColor,
  _style?: HighlightStyleKey,
): boolean {
  const map = getHighlightMap();
  if (map[ref]?.color === color) {
    removeHighlight(ref);
    return false;
  }
  setHighlight(ref, color);
  return true;
}
