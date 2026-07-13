import { readEvents } from './reading';
import { maxGroupCheckinStreak, type BadgeStats } from './badge_events';
import type { BadgeProgress, BadgeRule, BadgeSpec } from './badge_catalog';
import type { BadgeCtx, BadgeDef } from './badges';
import {
  migrateLegacyReadingStorageIfNeeded,
  verseEventsStorageKey,
} from './reading_storage';

function ymd(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function readVerseRefs(): string[] {
  if (typeof window === 'undefined') return [];
  migrateLegacyReadingStorageIfNeeded();
  try {
    const raw = JSON.parse(localStorage.getItem(verseEventsStorageKey()) || '[]') as {
      ref: string;
    }[];
    return Array.isArray(raw) ? raw.map((e) => e.ref.toUpperCase()) : [];
  } catch {
    return [];
  }
}

function hasChapter(book: string, chapter: number): boolean {
  return readEvents().some((e) => e.book === book && e.chapter === chapter);
}

function hasVerseRef(ref: string): boolean {
  const norm = ref.toUpperCase();
  if (readVerseRefs().includes(norm)) return true;
  const parts = norm.split('.');
  if (parts.length < 2) return false;
  const book = parts[0];
  const chapter = Number(parts[1]);
  return readEvents().some((e) => e.book === book && e.chapter === chapter);
}

function psalmsToday(): number {
  const today = ymd(Date.now());
  const chs = new Set<number>();
  for (const e of readEvents()) {
    if (e.book !== 'PSA') continue;
    if (ymd(e.ts) !== today) continue;
    chs.add(e.chapter);
  }
  return chs.size;
}

function gospelsStarted(): number {
  const gospels = ['MAT', 'MRK', 'LUK', 'JHN'];
  const set = new Set<string>();
  for (const e of readEvents()) {
    if (gospels.includes(e.book)) set.add(e.book);
  }
  return set.size;
}

function shortBookCompleted(totals: Record<string, number>): boolean {
  const distinct: Record<string, Set<number>> = {};
  for (const e of readEvents()) {
    (distinct[e.book] ||= new Set()).add(e.chapter);
  }
  for (const [book, total] of Object.entries(totals)) {
    if (total > 10 || total <= 0) continue;
    if ((distinct[book]?.size ?? 0) >= total) return true;
  }
  return false;
}

function tripleSceneSameRef(stats: BadgeStats, min: number): boolean {
  return Object.values(stats.ref_scenes).some((scenes) => scenes.length >= min);
}

function ctxNumber(ctx: BadgeCtx, field: string): number {
  if (field.startsWith('stats.')) {
    return statsNumber(ctx.stats, field.slice('stats.'.length));
  }
  const v = (ctx as Record<string, unknown>)[field];
  return typeof v === 'number' ? v : 0;
}

function statsNumber(stats: BadgeStats, path: string): number {
  if (path.endsWith('.length')) {
    const key = path.slice(0, -'.length'.length) as keyof BadgeStats;
    const arr = stats[key];
    return Array.isArray(arr) ? arr.length : 0;
  }
  const v = stats[path as keyof BadgeStats];
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return 0;
}

function statsBool(stats: BadgeStats, field: string): boolean {
  const v = stats[field as keyof BadgeStats];
  return Boolean(v);
}

function statsIncludes(stats: BadgeStats, field: string, value: string): boolean {
  const arr = stats[field as keyof BadgeStats];
  return Array.isArray(arr) && arr.includes(value);
}

function evalCustom(name: string, ctx: BadgeCtx, args?: Record<string, unknown>): boolean {
  const min = Number(args?.min ?? 0);
  switch (name) {
    case 'short_book_complete':
      return shortBookCompleted(ctx.bookTotals);
    case 'psalm_day':
      return psalmsToday() >= min;
    case 'gospels_started':
      return gospelsStarted() >= min;
    case 'triple_scene':
      return tripleSceneSameRef(ctx.stats, min);
    case 'group_checkin_streak':
      return maxGroupCheckinStreak(ctx.stats) >= min;
    case 'has_verse_ref':
      return hasVerseRef(String(args?.ref ?? ''));
    case 'has_chapter':
      return hasChapter(String(args?.book ?? ''), Number(args?.chapter ?? 0));
    default:
      return false;
  }
}

export function evaluateRule(rule: BadgeRule, ctx: BadgeCtx): boolean {
  switch (rule.type) {
    case 'ctx_gte':
      return ctxNumber(ctx, rule.field) >= rule.value;
    case 'stats_gte':
      return statsNumber(ctx.stats, rule.field) >= rule.value;
    case 'stats_array_len_gte':
      return statsNumber(ctx.stats, `${rule.field}.length`) >= rule.value;
    case 'stats_includes':
      return statsIncludes(ctx.stats, rule.field, rule.value);
    case 'stats_bool':
      return statsBool(ctx.stats, rule.field);
    case 'custom':
      return evalCustom(rule.name, ctx, rule.args);
    default:
      return false;
  }
}

function formatProgress(progress: BadgeProgress, ctx: BadgeCtx, done: boolean): string {
  if (progress.type === 'bool') return done ? '1/1' : '0/1';
  if (progress.type === 'ratio') {
    const cur = Math.min(ctxNumber(ctx, progress.field), progress.max);
    return `${cur}/${progress.max}`;
  }
  if (progress.type === 'custom') {
    const min = Number(progress.args?.min ?? 1);
    switch (progress.name) {
      case 'short_book_complete':
        return shortBookCompleted(ctx.bookTotals) ? '1/1' : '0/1';
      case 'psalm_day': {
        const n = psalmsToday();
        return `${Math.min(n, min)}/${min}`;
      }
      case 'gospels_started': {
        const n = gospelsStarted();
        return `${Math.min(n, min)}/${min}`;
      }
      case 'triple_scene': {
        const n = Math.max(0, ...Object.values(ctx.stats.ref_scenes).map((a) => a.length), 0);
        return done ? `${min}/${min}` : `${n}/${min}`;
      }
      case 'group_checkin_streak': {
        const n = maxGroupCheckinStreak(ctx.stats);
        return `${Math.min(n, min)}/${min}`;
      }
      default:
        return done ? '1/1' : '0/1';
    }
  }
  return done ? '1/1' : '0/1';
}

export function evaluateBadge(spec: BadgeSpec, ctx: BadgeCtx): BadgeDef {
  const done = evaluateRule(spec.rule, ctx);
  return {
    id: spec.id,
    label: spec.label,
    desc: spec.desc,
    hint: spec.hint,
    icon: spec.icon,
    category: spec.category,
    interesting: spec.interesting,
    done,
    progress: formatProgress(spec.progress, ctx, done),
  };
}

export function evaluateAllBadges(specs: BadgeSpec[], ctx: BadgeCtx): BadgeDef[] {
  return specs.map((spec) => evaluateBadge(spec, ctx));
}
