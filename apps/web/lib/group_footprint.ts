// 打卡「足迹候选」：刚读完 / 今日计划 / 收藏经节（PRODUCT §5.4.3）

import { loadFavoriteRefs } from './favorites';
import { chapterRef } from './group_checkin';
import { getActivePlan, getPlanDay } from './plan_progress';
import { getLastRead } from './reading';

export interface FootprintRef {
  ref: string;
  label: string;
  source: 'recent' | 'plan' | 'favorite' | 'last' | 'task';
}

const EVENTS_KEY = 'presto_read_events';

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

function todayChapterRefs(): { book: string; chapter: number }[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = JSON.parse(localStorage.getItem(EVENTS_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    const today = ymd(new Date());
    const seen = new Set<string>();
    const out: { book: string; chapter: number }[] = [];
    for (const e of raw) {
      if (!e || typeof e.book !== 'string' || typeof e.chapter !== 'number') continue;
      const d = new Date(e.ts);
      if (ymd(d) !== today) continue;
      const key = `${e.book}.${e.chapter}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ book: e.book, chapter: e.chapter });
    }
    return out.reverse().slice(0, 5);
  } catch {
    return [];
  }
}

function chapterRefFromBook(book: string, chapter: number): string {
  return chapterRef(book, chapter);
}

/** 同步足迹（计划经节需异步补全，见 loadFootprintRefs）。 */
export function syncFootprintRefs(): FootprintRef[] {
  const out: FootprintRef[] = [];
  const seen = new Set<string>();

  const push = (ref: string, label: string, source: FootprintRef['source']) => {
    if (!ref || seen.has(ref)) return;
    seen.add(ref);
    out.push({ ref, label, source });
  };

  for (const { book, chapter } of todayChapterRefs()) {
    const ref = chapterRefFromBook(book, chapter);
    push(ref, `今天读过 · ${book} ${chapter}`, 'recent');
  }

  const last = getLastRead();
  if (last) {
    const ref = chapterRefFromBook(last.bookId, last.chapter);
    push(ref, `续读位置 · ${last.bookId} ${last.chapter}`, 'last');
  }

  for (const ref of loadFavoriteRefs().slice(0, 8)) {
    push(ref, `收藏 · ${ref}`, 'favorite');
  }

  return out.slice(0, 12);
}

/** 含今日计划经节的完整足迹列表。 */
export async function loadFootprintRefs(opts?: {
  taskRef?: string | null;
  taskTitle?: string | null;
}): Promise<FootprintRef[]> {
  const out = syncFootprintRefs();
  const seen = new Set(out.map((f) => f.ref));

  if (opts?.taskRef) {
    const ref = opts.taskRef;
    if (!seen.has(ref)) {
      seen.add(ref);
      out.unshift({
        ref,
        label: opts.taskTitle ? `任务 · ${opts.taskTitle}` : `任务 · ${ref}`,
        source: 'task',
      });
    }
  }

  const plan = getActivePlan();
  if (!plan) return out;

  try {
    const { loadStepsForDay } = await import('./plan_reading');
    const day = getPlanDay(plan.planId) || 1;
    const steps = await loadStepsForDay(plan, day);
    for (const step of steps) {
      const ref = chapterRef(step.bookId, step.chapterStart);
      if (seen.has(ref)) continue;
      seen.add(ref);
      out.unshift({
        ref,
        label: `今日计划 · ${step.label}`,
        source: 'plan',
      });
    }
  } catch {
    /* ignore plan load errors */
  }
  return out.slice(0, 14);
}

/** 从 ref 解析读经页链接（章级）；可附带群任务上下文。 */
export function readerHrefFromRef(
  ref: string,
  opts?: { group?: string; task?: string },
): string | null {
  const m = ref.match(/^([A-Za-z0-9]+)\.(\d+)(?:\.(\d+))?$/);
  if (!m) return null;
  const params = new URLSearchParams({ book: m[1], chapter: m[2] });
  if (m[3]) params.set('verse', m[3]);
  if (opts?.group) params.set('group', opts.group);
  if (opts?.task) params.set('task', opts.task);
  return `/reader?${params.toString()}`;
}
