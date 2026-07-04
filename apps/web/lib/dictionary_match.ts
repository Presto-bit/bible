/** 词典同名消歧：按经文上下文匹配 + 用户选择记忆 */

import type { DictEntity } from '@/lib/api';

export type DictContext = {
  bookId: string;
  chapter: number;
  verse: number;
};

const NT_BOOKS = new Set([
  'MAT', 'MRK', 'LUK', 'JHN', 'ACT', 'ROM', '1CO', '2CO', 'GAL', 'EPH', 'PHP', 'COL',
  '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM', 'HEB', 'JAS', '1PE', '2PE', '1JN', '2JN',
  '3JN', 'JUD', 'REV',
]);

const CHOICE_PREFIX = 'dict_choice_';

function refBook(ref: string): string | null {
  const m = ref.trim().match(/^([1-3]?[A-Z]{2,4})[\s.:]/i);
  return m ? m[1].toUpperCase() : null;
}

function refCoords(ref: string): { book: string; chapter: number; verse: number } | null {
  const m = ref.trim().match(/^([1-3]?[A-Z]{2,4})[\s.:]+(\d+)[\s.:]+(\d+)/i);
  if (!m) return null;
  return { book: m[1].toUpperCase(), chapter: Number(m[2]), verse: Number(m[3]) };
}

function testament(bookId: string): 'OT' | 'NT' {
  return NT_BOOKS.has(bookId.toUpperCase()) ? 'NT' : 'OT';
}

export function entityDisplayName(e: DictEntity): string {
  const d = e.disambiguation?.trim();
  return d ? `${e.name}（${d}）` : e.name;
}

const TYPE_ZH: Record<string, string> = {
  person: '人物',
  place: '地点',
  term: '术语',
  event: '事件',
};

/** 词条类型中文标签 */
export function entityTypeLabel(type: string | undefined): string {
  if (!type) return '';
  return TYPE_ZH[type] ?? type;
}

/** 展示用摘要：过滤 Male/City 等无效英文标签 */
export function entitySummaryText(e: DictEntity): string {
  const s = (e.summary || '').trim();
  if (!s) return '暂无简介';
  // 无中文且过短 → 视为无效摘要
  if (!/[\u4e00-\u9fff]/.test(s)) {
    const label = entityTypeLabel(e.type) || '词条';
    return `圣经中的${label}「${e.name}」。`;
  }
  return s;
}

/** name/alias -> 全部候选词条 */
export function buildDictIndex(entities: DictEntity[]): Map<string, DictEntity[]> {
  const m = new Map<string, DictEntity[]>();
  const push = (key: string, ent: DictEntity) => {
    if (!key || key.length < 2) return;
    const list = m.get(key) ?? [];
    if (!list.some((x) => x.id === ent.id)) list.push(ent);
    m.set(key, list);
  };
  for (const e of entities) {
    push(e.name, e);
    for (const a of e.aliases ?? []) push(a, e);
  }
  return m;
}

function scoreEntity(e: DictEntity, ctx: DictContext): number {
  let score = 0;
  const ctxT = testament(ctx.bookId);
  if (e.testament === ctxT) score += 40;
  if (e.testament === 'BOTH') score += 20;

  const scope = new Set((e.scope_books ?? []).map((b) => b.toUpperCase()));
  if (scope.has(ctx.bookId.toUpperCase())) score += 80;

  for (const ref of e.refs ?? []) {
    const c = refCoords(ref.replace(/\./g, ' '));
    if (!c) continue;
    if (c.book === ctx.bookId.toUpperCase()) {
      score += 30;
      if (c.chapter === ctx.chapter) {
        score += 20;
        score += Math.max(0, 15 - Math.abs(c.verse - ctx.verse));
      }
    } else if (testament(c.book) === ctxT) {
      score += 5;
    }
  }
  return score;
}

function choiceKey(name: string, bookId: string): string {
  return `${CHOICE_PREFIX}${name}_${bookId.toUpperCase()}`;
}

export function readDictChoice(name: string, bookId: string): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(choiceKey(name, bookId));
}

export function writeDictChoice(name: string, bookId: string, entityId: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(choiceKey(name, bookId), entityId);
}

export function lookupDictCandidates(
  name: string,
  index: Map<string, DictEntity[]>,
  ctx: DictContext,
): DictEntity[] {
  const list = index.get(name) ?? [];
  if (list.length <= 1) return list;

  const remembered = readDictChoice(name, ctx.bookId);
  if (remembered) {
    const hit = list.find((e) => e.id === remembered);
    if (hit) return [hit];
  }

  return [...list].sort((a, b) => scoreEntity(b, ctx) - scoreEntity(a, ctx));
}

export function needsDisambiguation(candidates: DictEntity[], ctx: DictContext): boolean {
  if (candidates.length <= 1) return false;
  const scores = candidates.map((c) => scoreEntity(c, ctx));
  if (scores[0] - scores[1] >= 35) return false;
  return true;
}

export function dictMatchPattern(index: Map<string, DictEntity[]>): RegExp | null {
  const names = Array.from(index.keys())
    .filter((n) => n.length >= 2)
    .sort((a, b) => b.length - a.length)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!names.length) return null;
  return new RegExp(`(${names.join('|')})`, 'g');
}

export { refBook, refCoords, testament };
