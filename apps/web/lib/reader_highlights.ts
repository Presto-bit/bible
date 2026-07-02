import { enqueueHighlight } from './highlight_sync';

export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink' | 'orange';
export type HighlightStyleKey = 'color' | 'solid' | 'dashed';

export type HighlightMark = { color: HighlightColor; style: HighlightStyleKey };

const HL_KEY = 'reader_highlights_v1';
const STYLE_KEY = 'reader_highlight_styles_v1';

export function getHighlights(): Record<string, HighlightColor> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(HL_KEY) || '{}');
  } catch {
    return {};
  }
}

export function getHighlightStyles(): Record<string, HighlightStyleKey> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(STYLE_KEY) || '{}');
  } catch {
    return {};
  }
}

export function getHighlightMap(): Record<string, HighlightMark> {
  const colors = getHighlights();
  const styles = getHighlightStyles();
  const map: Record<string, HighlightMark> = {};
  for (const ref of Object.keys(colors)) {
    map[ref] = { color: colors[ref], style: styles[ref] ?? 'color' };
  }
  return map;
}

export function selectionRef(bookId: string, chapter: number, verses: number[]): string {
  const sel = [...verses].sort((a, b) => a - b);
  if (!sel.length) return `${bookId}.${chapter}`;
  if (sel[0] === sel[sel.length - 1]) return `${bookId}.${chapter}.${sel[0]}`;
  return `${bookId}.${chapter}.${sel[0]}-${sel[sel.length - 1]}`;
}

/** 查找 localStorage 中实际存储划线的 ref（兼容单节/区间 key 不一致）。 */
export function findHighlightStorageRef(
  bookId: string,
  chapter: number,
  verses: number[],
  map?: Record<string, HighlightMark>,
): string | null {
  const hl = map ?? getHighlightMap();
  const sel = [...verses].sort((a, b) => a - b);
  if (!sel.length) return null;

  const selRef = selectionRef(bookId, chapter, sel);
  if (hl[selRef]) return selRef;

  for (const v of sel) {
    const single = `${bookId}.${chapter}.${v}`;
    if (hl[single]) return single;
  }

  const min = sel[0];
  const max = sel[sel.length - 1];

  for (const ref of Object.keys(hl)) {
    const parts = ref.split('.');
    if (parts.length < 3 || parts[0] !== bookId || Number(parts[1]) !== chapter) continue;
    const tail = parts[2];
    if (tail.includes('-')) {
      const [a, b] = tail.split('-').map(Number);
      if (!Number.isNaN(a) && !Number.isNaN(b) && a === min && b === max) return ref;
    }
  }

  for (const ref of Object.keys(hl)) {
    const parts = ref.split('.');
    if (parts.length < 3 || parts[0] !== bookId || Number(parts[1]) !== chapter) continue;
    const tail = parts[2];
    let start: number;
    let end: number;
    if (tail.includes('-')) {
      const [a, b] = tail.split('-').map(Number);
      if (Number.isNaN(a) || Number.isNaN(b)) continue;
      start = a;
      end = b;
    } else {
      start = end = Number(tail);
      if (Number.isNaN(start)) continue;
    }
    if (start <= min && end >= max) return ref;
  }

  return null;
}

export function removeHighlight(ref: string): boolean {
  const colors = getHighlights();
  if (!(ref in colors)) return false;
  const prevColor = colors[ref];
  const styles = getHighlightStyles();
  delete colors[ref];
  delete styles[ref];
  localStorage.setItem(HL_KEY, JSON.stringify(colors));
  localStorage.setItem(STYLE_KEY, JSON.stringify(styles));
  enqueueHighlight(ref, prevColor, true);
  return true;
}

export function setHighlight(ref: string, color: HighlightColor, style: HighlightStyleKey = 'color') {
  const colors = getHighlights();
  const styles = getHighlightStyles();
  colors[ref] = color;
  styles[ref] = style;
  localStorage.setItem(HL_KEY, JSON.stringify(colors));
  localStorage.setItem(STYLE_KEY, JSON.stringify(styles));
  enqueueHighlight(ref, color, false);
}

/** 微信读书式：点色即应用；再点同色删除。 */
export function pickHighlightColor(
  bookId: string,
  chapter: number,
  verses: number[],
  color: HighlightColor,
  style: HighlightStyleKey = 'color',
): boolean {
  const sorted = [...verses].sort((a, b) => a - b);
  const targetRef = selectionRef(bookId, chapter, sorted);
  const map = getHighlightMap();
  const existingRef = findHighlightStorageRef(bookId, chapter, sorted, map);

  if (existingRef) {
    const mark = map[existingRef];
    if (mark.color === color && mark.style === style) {
      removeHighlight(existingRef);
      return false;
    }
    if (existingRef !== targetRef) removeHighlight(existingRef);
  }

  setHighlight(targetRef, color, style);
  return true;
}

export function clearHighlightForSelection(
  bookId: string,
  chapter: number,
  verses: number[],
): boolean {
  const ref = findHighlightStorageRef(bookId, chapter, verses);
  if (!ref) return false;
  return removeHighlight(ref);
}

/** @deprecated 使用 pickHighlightColor */
export function toggleHighlight(
  ref: string,
  color: HighlightColor,
  style: HighlightStyleKey,
): boolean {
  const colors = getHighlights();
  const styles = getHighlightStyles();
  if (colors[ref] === color && (styles[ref] ?? 'color') === style) {
    removeHighlight(ref);
    return false;
  }
  setHighlight(ref, color, style);
  return true;
}

export function markForVerse(
  map: Record<string, HighlightMark>,
  bookId: string,
  chapter: number,
  verse: number,
): HighlightMark | null {
  const exact = map[`${bookId}.${chapter}.${verse}`];
  if (exact) return exact;
  for (const [ref, mark] of Object.entries(map)) {
    const parts = ref.split('.');
    if (parts.length < 3 || parts[0] !== bookId || Number(parts[1]) !== chapter) continue;
    const tail = parts[2];
    if (tail.includes('-')) {
      const [a, b] = tail.split('-').map(Number);
      if (!Number.isNaN(a) && !Number.isNaN(b) && verse >= a && verse <= b) return mark;
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
  return Object.keys(getHighlights()).length;
}

export function highlightClass(mark: HighlightMark | null): string {
  if (!mark) return '';
  return `verse-mark verse-mark-${mark.style} verse-mark-${mark.color}`;
}

// 边缘批注（旧 API，保留兼容）
const NOTE_KEY = 'reader_margin_notes_v1';

export function getMarginNotes(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(NOTE_KEY) || '{}');
  } catch {
    return {};
  }
}

export function setMarginNote(ref: string, text: string) {
  const m = getMarginNotes();
  if (text.trim()) m[ref] = text.trim();
  else delete m[ref];
  localStorage.setItem(NOTE_KEY, JSON.stringify(m));
}
