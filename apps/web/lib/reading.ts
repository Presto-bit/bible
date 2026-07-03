// H5 阅读日志（本地优先，localStorage）。与 App reading_log（minutes/chapters）对齐：
// 按日期聚合，供「读经回顾」报告页计算本月磁贴 / 近 6 月趋势 / 累计。

export interface DayLog {
  minutes: number;
  chapters: number;
}

const KEY = 'presto_reading_log';
const SEC_BUFFER_KEY = 'presto_read_sec_buffer';

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

function read(): Record<string, DayLog> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') as Record<string, DayLog>;
  } catch {
    return {};
  }
}

function write(logs: Record<string, DayLog>) {
  localStorage.setItem(KEY, JSON.stringify(logs));
}

function addDwellSeconds(sec: number) {
  if (sec <= 0 || typeof window === 'undefined') return;
  const day = ymd(new Date());
  let buffers: Record<string, number> = {};
  try {
    buffers = JSON.parse(localStorage.getItem(SEC_BUFFER_KEY) || '{}') as Record<string, number>;
  } catch {
    buffers = {};
  }
  const totalSec = (buffers[day] || 0) + sec;
  const addMin = Math.floor(totalSec / 60);
  buffers[day] = totalSec % 60;
  localStorage.setItem(SEC_BUFFER_KEY, JSON.stringify(buffers));
  if (addMin <= 0) return;
  const logs = read();
  const cur = logs[day] || { minutes: 0, chapters: 0 };
  logs[day] = { ...cur, minutes: cur.minutes + addMin };
  write(logs);
}

let dwellActiveSince: number | null = null;

/** 开始统计在圣经经文页的停留时长（可见且在前台时）。 */
export function readerDwellResume() {
  if (typeof window === 'undefined' || document.visibilityState === 'hidden') return;
  if (dwellActiveSince != null) return;
  dwellActiveSince = Date.now();
}

/** 暂停停留计时并写入当日阅读分钟。 */
export function readerDwellPause() {
  if (dwellActiveSince == null) return;
  const sec = Math.floor((Date.now() - dwellActiveSince) / 1000);
  dwellActiveSince = null;
  addDwellSeconds(sec);
}

// 上次阅读位置（进入圣经默认续读）。
const LAST_KEY = 'presto_last_read';

export interface LastRead {
  bookId: string;
  chapter: number;
}

const LAST_VERSE_KEY = 'presto_last_verse';

function lastVerseStorageKey(bookId: string, chapter: number): string {
  return `${LAST_VERSE_KEY}:${bookId.toUpperCase()}:${chapter}`;
}

/** 记录本章已读到的最高经节（只增不减，按卷章隔离）。 */
export function setLastReadVerse(bookId: string, chapter: number, verse: number) {
  if (typeof window === 'undefined' || !bookId || chapter < 1 || verse < 1) return;
  const key = lastVerseStorageKey(bookId, chapter);
  const prev = getLastReadVerse(bookId, chapter);
  const next = prev != null ? Math.max(prev, verse) : verse;
  localStorage.setItem(key, String(next));
}

export function getLastReadVerse(bookId: string, chapter: number): number | null {
  if (typeof window === 'undefined' || !bookId || chapter < 1) return null;
  const v = Number(localStorage.getItem(lastVerseStorageKey(bookId, chapter)));
  return Number.isFinite(v) && v > 0 ? v : null;
}

export function setLastRead(bookId: string, chapter: number) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LAST_KEY, JSON.stringify({ bookId, chapter }));
  void import('./reading_progress_sync').then((m) => m.pushReadingProgress({ bookId, chapter }));
}

export function getLastRead(): LastRead | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LAST_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (v && typeof v.bookId === 'string' && typeof v.chapter === 'number') return v;
    return null;
  } catch {
    return null;
  }
}

/** 是否展示首次续读提示（仅第一次从底部 Tab 进入圣经时闪动一次） */
const FIRST_TAB_HINT_KEY = 'presto_reader_tab_hint_shown';
const TAB_ENTRY_KEY = 'reader_tab_entry';

export function markReaderTabEntry() {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(TAB_ENTRY_KEY, '1');
}

function consumeReaderTabEntry(): boolean {
  if (typeof window === 'undefined') return false;
  const fromTab = sessionStorage.getItem(TAB_ENTRY_KEY) === '1';
  sessionStorage.removeItem(TAB_ENTRY_KEY);
  return fromTab;
}

export function shouldShowResumeHint(): boolean {
  if (typeof window === 'undefined') return false;
  if (!consumeReaderTabEntry()) return false;
  if (localStorage.getItem(FIRST_TAB_HINT_KEY) === '1') return false;
  localStorage.setItem(FIRST_TAB_HINT_KEY, '1');
  return true;
}

/** @deprecated 使用 shouldShowResumeHint */
export function shouldResumeFlash(_bookId: string, _chapter: number, _verse: number): boolean {
  return shouldShowResumeHint();
}

// 阅读一章：当日 chapters +1（分钟由经文页停留时长统计）。
export function logChapterRead() {
  if (typeof window === 'undefined') return;
  const logs = read();
  const k = ymd(new Date());
  const cur = logs[k] || { minutes: 0, chapters: 0 };
  logs[k] = {
    minutes: cur.minutes,
    chapters: cur.chapters + 1,
  };
  write(logs);
}

// ── 章节级阅读明细（供日历回顾「常读卷/章」与读经进度） ──
const EVENTS_KEY = 'presto_read_events';

export interface ReadEvent {
  ts: number; // 毫秒时间戳
  book: string; // 卷 id（如 JHN）
  chapter: number;
}

function readEvents(): ReadEvent[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = JSON.parse(localStorage.getItem(EVENTS_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

// 记录一次具体章节阅读（去抖：同卷章 30 分钟内只记一次，避免来回翻页刷量）。
export function logChapterDetail(book: string, chapter: number) {
  if (typeof window === 'undefined') return;
  const events = readEvents();
  const now = Date.now();
  const recent = events.find(
    (e) => e.book === book && e.chapter === chapter && now - e.ts < 30 * 60 * 1000,
  );
  if (recent) return;
  events.push({ ts: now, book, chapter });
  // 仅保留最近 2000 条，控制体积。
  const trimmed = events.slice(-2000);
  localStorage.setItem(EVENTS_KEY, JSON.stringify(trimmed));
}

/** 若该卷刚读完一遍，触发知识挑战弱推送（仅首次）。 */
export function maybeNotifyBookComplete(
  bookId: string,
  bookName: string,
  chapterCount: number,
) {
  if (typeof window === 'undefined' || chapterCount <= 0) return;
  const prog = bookProgressMap({ [bookId]: chapterCount })[bookId];
  if (prog && prog.passes >= 1) {
    import('./challenge_progress').then(({ setPendingBookChallenge }) => {
      setPendingBookChallenge(bookId, bookName);
    });
  }
}

// ── 金句（常读经节）记录：阅读时选中/聚焦某节即记一次 ──
const VERSE_EVENTS_KEY = 'presto_verse_events';

export interface VerseEvent {
  ts: number;
  ref: string; // 形如 JHN.3.16
}

function readVerseEvents(): VerseEvent[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = JSON.parse(localStorage.getItem(VERSE_EVENTS_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function logVerseRead(ref: string) {
  if (typeof window === 'undefined' || !ref) return;
  const events = readVerseEvents();
  const now = Date.now();
  const recent = events.find((e) => e.ref === ref && now - e.ts < 10 * 1000);
  if (recent) return;
  events.push({ ts: now, ref });
  localStorage.setItem(VERSE_EVENTS_KEY, JSON.stringify(events.slice(-3000)));
}

/** 快速翻页不计进度：未滚动/停留不足时不记入章节进度。 */
export const MIN_CHAPTER_DWELL_SEC = 20;
export const MIN_CHAPTER_ENGAGED_SEC = 8;

let pendingChapterLog: {
  book: string;
  chapter: number;
  timer: ReturnType<typeof setTimeout>;
} | null = null;

export function cancelPendingChapterProgress() {
  if (pendingChapterLog?.timer) clearTimeout(pendingChapterLog.timer);
  pendingChapterLog = null;
}

/** 章节加载后延迟记入进度；已滚动阅读时缩短等待。 */
export function scheduleChapterProgress(
  book: string,
  chapter: number,
  engaged: boolean,
  onLogged?: () => void,
) {
  if (typeof window === 'undefined') return;
  cancelPendingChapterProgress();
  const delayMs = (engaged ? MIN_CHAPTER_ENGAGED_SEC : MIN_CHAPTER_DWELL_SEC) * 1000;
  const timer = setTimeout(() => {
    logChapterRead();
    logChapterDetail(book, chapter);
    pendingChapterLog = null;
    onLogged?.();
  }, delayMs);
  pendingChapterLog = { book, chapter, timer };
}

/** 滚动阅读后立即确认本章进度（仍受 logChapterDetail 去抖保护）。 */
export function confirmChapterProgress(
  book: string,
  chapter: number,
  onLogged?: () => void,
) {
  if (typeof window === 'undefined') return;
  if (
    !pendingChapterLog
    || pendingChapterLog.book !== book
    || pendingChapterLog.chapter !== chapter
  ) {
    return;
  }
  cancelPendingChapterProgress();
  logChapterRead();
  logChapterDetail(book, chapter);
  onLogged?.();
}

// 某卷最近一次阅读到的章（供「读经进度」点击跳到最新进度，而非开头）。
export function lastChapterOf(book: string): number | null {
  let best: ReadEvent | null = null;
  for (const e of readEvents()) {
    if (e.book !== book) continue;
    if (!best || e.ts > best.ts) best = e;
  }
  return best ? best.chapter : null;
}

export interface RankItem {
  key: string;
  count: number;
}

// 日期范围 [startMs, endMs) 内的统计：分钟、常读卷/章/金句。
export interface RangeStats {
  minutes: number;
  chapters: number;
  days: number;
  prayers: number;
  topBooks: RankItem[];
  topChapters: RankItem[];
  topVerses: RankItem[];
}

function prayersInRange(startMs: number, endMs: number): number {
  let n = 0;
  for (const [date, c] of Object.entries(readPrayer())) {
    const t = new Date(`${date}T00:00:00`).getTime();
    if (t >= startMs && t < endMs) n += c;
  }
  return n;
}

export function rangeStats(startMs: number, endMs: number): RangeStats {
  const logs = read();
  let minutes = 0;
  let chapters = 0;
  let days = 0;
  for (const [date, log] of Object.entries(logs)) {
    const t = new Date(`${date}T00:00:00`).getTime();
    if (t >= startMs && t < endMs) {
      minutes += log.minutes;
      chapters += log.chapters;
      if (log.minutes > 0 || log.chapters > 0) days += 1;
    }
  }
  const bookCount: Record<string, number> = {};
  const chapCount: Record<string, number> = {};
  for (const e of readEvents()) {
    if (e.ts >= startMs && e.ts < endMs) {
      bookCount[e.book] = (bookCount[e.book] || 0) + 1;
      const ck = `${e.book}.${e.chapter}`;
      chapCount[ck] = (chapCount[ck] || 0) + 1;
    }
  }
  const verseCount: Record<string, number> = {};
  for (const e of readVerseEvents()) {
    if (e.ts >= startMs && e.ts < endMs) {
      verseCount[e.ref] = (verseCount[e.ref] || 0) + 1;
    }
  }
  const rank = (m: Record<string, number>, n: number): RankItem[] =>
    Object.entries(m)
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, n);
  return {
    minutes,
    chapters,
    days,
    prayers: prayersInRange(startMs, endMs),
    topBooks: rank(bookCount, 5),
    topChapters: rank(chapCount, 5),
    topVerses: rank(verseCount, 3),
  };
}

// 今日阅读分钟数（供「阅读时长」卡片）。
export function todayMinutes(): number {
  const logs = read();
  return logs[ymd(new Date())]?.minutes || 0;
}

// 每日分钟映射（供日历热力）。
export function dailyMinutes(): Record<string, number> {
  const logs = read();
  const out: Record<string, number> = {};
  for (const [date, log] of Object.entries(logs)) out[date] = log.minutes;
  return out;
}

// 读经进度：每卷已读「遍数 + 余下百分比」。totalChapters 由调用方传入（books 接口）。
export interface BookProgress {
  passes: number; // 完整读完遍数
  remainderPct: number; // 当前这一遍的百分比（0–99）
  distinctChapters: number; // 不同章数（本年度/全部）
}

export function bookProgressMap(
  totals: Record<string, number>,
  startMs?: number,
  endMs?: number,
): Record<string, BookProgress> {
  const reads: Record<string, number> = {};
  for (const e of readEvents()) {
    if (startMs != null && (e.ts < startMs || e.ts >= endMs!)) continue;
    reads[e.book] = (reads[e.book] || 0) + 1;
  }
  const distinct: Record<string, Set<number>> = {};
  for (const e of readEvents()) {
    if (startMs != null && (e.ts < startMs || e.ts >= endMs!)) continue;
    (distinct[e.book] ||= new Set()).add(e.chapter);
  }
  const out: Record<string, BookProgress> = {};
  for (const [book, total] of Object.entries(totals)) {
    const r = reads[book] || 0;
    if (r === 0 || total <= 0) {
      out[book] = { passes: 0, remainderPct: 0, distinctChapters: 0 };
      continue;
    }
    const passes = Math.floor(r / total);
    const remainderPct = Math.round(((r % total) / total) * 100);
    out[book] = {
      passes,
      remainderPct,
      distinctChapters: distinct[book]?.size || 0,
    };
  }
  return out;
}

const PRAYER_KEY = 'presto_prayer_log';

function readPrayer(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(PRAYER_KEY) || '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

// 祷告打卡：当日计数 +1。供报告统计「本月祷告次数」。
export function logPrayer() {
  if (typeof window === 'undefined') return;
  const logs = readPrayer();
  const k = ymd(new Date());
  logs[k] = (logs[k] || 0) + 1;
  localStorage.setItem(PRAYER_KEY, JSON.stringify(logs));
}

export function prayedToday(): boolean {
  return (readPrayer()[ymd(new Date())] || 0) > 0;
}

export function prayerCountInRange(startMs: number, endMs: number): number {
  return prayersInRange(startMs, endMs);
}

function monthPrayerCount(): number {
  const now = new Date();
  const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  let n = 0;
  for (const [date, c] of Object.entries(readPrayer())) {
    if (date.startsWith(cur)) n += c;
  }
  return n;
}

export interface ReadingReport {
  monthMinutes: number;
  monthDays: number;
  monthChapters: number;
  monthPrayers: number;
  totalMinutes: number;
  totalChapters: number;
  monthly: { label: string; minutes: number; chapters: number }[];
}

export function buildReport(): ReadingReport {
  const logs = read();
  const now = new Date();
  const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  let monthMinutes = 0;
  let monthChapters = 0;
  let monthDays = 0;
  let totalMinutes = 0;
  let totalChapters = 0;

  for (const [date, log] of Object.entries(logs)) {
    totalMinutes += log.minutes;
    totalChapters += log.chapters;
    if (date.startsWith(curMonth)) {
      monthMinutes += log.minutes;
      monthChapters += log.chapters;
      if (log.minutes > 0 || log.chapters > 0) monthDays += 1;
    }
  }

  // 近 6 个月趋势
  const monthly: { label: string; minutes: number; chapters: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    let minutes = 0;
    let chapters = 0;
    for (const [date, log] of Object.entries(logs)) {
      if (date.startsWith(key)) {
        minutes += log.minutes;
        chapters += log.chapters;
      }
    }
    monthly.push({ label: `${d.getMonth() + 1}月`, minutes, chapters });
  }

  return {
    monthMinutes,
    monthDays,
    monthChapters,
    monthPrayers: monthPrayerCount(),
    totalMinutes,
    totalChapters,
    monthly,
  };
}
