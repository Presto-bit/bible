/** 日常「本章读完」轻提示频控。 */

const DAY_KEY = 'chapter_complete_tip_day_v1';

/** 同 Tab 会话内已展示（先于 localStorage，防 effect 连跑重复弹）。 */
const sessionShown = new Set<string>();

type DayMap = { day: string; chapters: Record<string, 1> };

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function chapterKey(bookId: string, chapter: number): string {
  return `${bookId.toUpperCase()}.${chapter}`;
}

function readDay(): DayMap {
  if (typeof window === 'undefined') return { day: todayKey(), chapters: {} };
  try {
    const raw = JSON.parse(localStorage.getItem(DAY_KEY) || 'null') as DayMap | null;
    const day = todayKey();
    if (!raw || raw.day !== day) return { day, chapters: {} };
    return { day, chapters: raw.chapters || {} };
  } catch {
    return { day: todayKey(), chapters: {} };
  }
}

function writeDay(m: DayMap) {
  try {
    localStorage.setItem(DAY_KEY, JSON.stringify(m));
  } catch {
    /* ignore */
  }
}

export function hasShownChapterCompleteTip(bookId: string, chapter: number): boolean {
  const key = chapterKey(bookId, chapter);
  if (sessionShown.has(key)) return true;
  return Boolean(readDay().chapters[key]);
}

export function markChapterCompleteTipShown(bookId: string, chapter: number): void {
  const key = chapterKey(bookId, chapter);
  if (sessionShown.has(key)) return;
  sessionShown.add(key);
  const m = readDay();
  m.chapters[key] = 1;
  writeDay(m);
}
