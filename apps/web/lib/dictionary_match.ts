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

const ARTIFACT_ENTITY_IDS = new Set([
  '约柜', '会幕', '圣殿', '逾越节', '法柜',
]);

/** 高频专名：一章只显首次划线。 */
export const CHAPTER_SCOPED_DICT_IDS = new Set(['jesus', 'god', '基督', '耶和华']);
export const CHAPTER_SCOPED_DICT_NAMES = new Set(['耶稣', '基督', '弥赛亚', '神', '耶和华', 'God']);

export function isChapterScopedDictKey(entityId: string, surfaceName: string): boolean {
  return CHAPTER_SCOPED_DICT_IDS.has(entityId) || CHAPTER_SCOPED_DICT_NAMES.has(surfaceName);
}

export function dictUnderlineClaimKeys(entityId: string, surfaceName: string): string[] {
  const keys = [entityId];
  const t = surfaceName.trim();
  if (t) keys.push(`t:${t}`);
  return keys;
}

/**
 * 登记 keys；任一已见则返回 false。
 * 兼容旧调用：仅传入 seen + keys。
 */
export function claimDictUnderline(seenIds: Set<string>, ...keys: string[]): boolean {
  const normalized = keys.map((k) => k.trim()).filter(Boolean);
  if (!normalized.length) return false;
  const show = !normalized.some((k) => seenIds.has(k));
  for (const k of normalized) seenIds.add(k);
  return show;
}

/** 分层去重：高频走 chapterSeen，其余走 verseSeen。 */
export function claimTieredDictUnderline(
  verseSeen: Set<string>,
  chapterSeen: Set<string>,
  entityId: string,
  surfaceName: string,
): boolean {
  const keys = dictUnderlineClaimKeys(entityId, surfaceName);
  if (!keys.length) return false;
  const chapterScope = isChapterScopedDictKey(entityId, surfaceName);
  const bucket = chapterScope ? chapterSeen : verseSeen;
  const show = !keys.some((k) => bucket.has(k));
  if (show) {
    for (const k of keys) bucket.add(k);
    if (chapterScope) for (const k of keys) verseSeen.add(k);
  }
  return show;
}

export type ChapterDictUnderlinePlan = {
  /** `${verse}|${start}` → 是否显式划线 */
  showAt: Map<string, boolean>;
};

export function chapterDictSpanKey(verse: number, start: number): string {
  return `${verse}|${start}`;
}

/** 收集一节内可链词典跨度（与正文 split 同源）。 */
export function dictSpansForVerseText(
  text: string,
  index: Map<string, DictEntity[]>,
  ctx: DictContext,
): { start: number; end: number; entity: DictEntity; name: string }[] {
  const re = dictMatchPattern(index);
  if (!re || !text) return [];
  const local = new RegExp(re.source, 'g');
  const out: { start: number; end: number; entity: DictEntity; name: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = local.exec(text)) !== null) {
    const name = m[1] ?? m[0];
    if (!name) continue;
    const ranked = lookupDictCandidates(name, index, ctx);
    const picked = ranked[0];
    if (!picked || !shouldLinkDictEntity(ranked, picked, ctx)) continue;
    out.push({
      start: m.index,
      end: m.index + name.length,
      entity: picked,
      name,
    });
  }
  return out;
}

/** 按章序预计算分层划线（展示文本须与渲染同一套 quote 格式）。 */
export function buildChapterDictUnderlinePlan(
  verses: { verse: number; text: string }[],
  index: Map<string, DictEntity[]>,
  bookId: string,
  chapter: number,
): ChapterDictUnderlinePlan {
  const chapterSeen = new Set<string>();
  const showAt = new Map<string, boolean>();
  for (const v of verses) {
    const verseSeen = new Set<string>();
    const ctx: DictContext = { bookId, chapter, verse: v.verse };
    for (const s of dictSpansForVerseText(v.text, index, ctx)) {
      const eid = s.entity.id || s.entity.name;
      const show = claimTieredDictUnderline(verseSeen, chapterSeen, eid, s.name);
      showAt.set(chapterDictSpanKey(v.verse, s.start), show);
    }
  }
  return { showAt };
}

export function planShowsDictUnderline(
  plan: ChapterDictUnderlinePlan | null | undefined,
  verse: number,
  start: number,
): boolean | null {
  if (!plan) return null;
  const v = plan.showAt.get(chapterDictSpanKey(verse, start));
  return v ?? null;
}

/**
 * 每节渲染前：高频专名在本节约之前的章内已声明集合（不可变快照）。
 * 渲染时复制进 Set，再与 verseSeen 做分层 claim，避免 List/Strict 乱序。
 */
export function buildChapterScopedClaimedBefore(
  verses: { verse: number; text: string }[],
  index: Map<string, DictEntity[]>,
  bookId: string,
  chapter: number,
): Map<number, ReadonlySet<string>> {
  const chapterSeen = new Set<string>();
  const before = new Map<number, ReadonlySet<string>>();
  for (const v of verses) {
    before.set(v.verse, new Set(chapterSeen));
    const verseSeen = new Set<string>();
    const ctx: DictContext = { bookId, chapter, verse: v.verse };
    for (const s of dictSpansForVerseText(v.text, index, ctx)) {
      const eid = s.entity.id || s.entity.name;
      claimTieredDictUnderline(verseSeen, chapterSeen, eid, s.name);
    }
  }
  return before;
}

/** 读经正文词链样式：人物点线、地点虚线、物件波浪；重复命中无可见划线。 */
export function properNounClass(
  entity: DictEntity,
  opts?: { showUnderline?: boolean },
): string {
  const base = 'proper-noun';
  if (opts?.showUnderline === false) return `${base} proper-noun--quiet`;
  if (entity.type === 'person') return `${base} proper-noun--person`;
  if (entity.type === 'place') return `${base} proper-noun--place`;
  const eid = entity.id ?? entity.name;
  if (entity.type === 'term' && ARTIFACT_ENTITY_IDS.has(eid)) {
    return `${base} proper-noun--artifact`;
  }
  return base;
}

/** 义项切换条短标签：优先消歧名括号前部分 */
export function entitySenseLabel(e: DictEntity): string {
  const d = e.disambiguation?.trim();
  if (d) {
    const head = d.match(/^[^（(]+/)?.[0]?.trim();
    if (head) return head;
  }
  const type = entityTypeLabel(e.type);
  return type ? `${e.name}·${type}` : e.name;
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

/** 人地同名：历史/地理书卷优先地点，族谱书卷优先人物 */
const PLACE_FAVOR_BOOKS = new Set([
  'JOS', 'JDG', 'RUT', '1SA', '2SA', '1KI', '2KI', '1CH', '2CH', 'EZR', 'NEH', 'EZK', 'AMO',
]);
const GENEALOGY_FAVOR_BOOKS = new Set(['GEN', '1CH']);

/** 书卷语境下的义项偏好（如约翰福音 → 使徒约翰） */
const BOOK_SENSE_HINTS: Record<string, RegExp> = {
  JHN: /使徒|所爱的门徒|福音作者|启示录/,
  '1JN': /使徒|所爱的门徒/,
  '2JN': /使徒|所爱的门徒/,
  '3JN': /使徒|所爱的门徒/,
  REV: /使徒|拔摩|启示录/,
  MRK: /马可|约翰马可/,
  ACT: /施洗|先锋|马可/,
  MAT: /施洗|先锋|使徒/,
  LUK: /施洗|先锋|使徒/,
};

function scoreEntity(e: DictEntity, ctx: DictContext): number {
  let score = 0;
  const bookId = ctx.bookId.toUpperCase();
  const ctxT = testament(bookId);
  if (e.testament === ctxT) score += 40;
  if (e.testament === 'BOTH') score += 20;

  if (e.type === 'place' && PLACE_FAVOR_BOOKS.has(bookId)) score += 55;
  if (e.type === 'person' && GENEALOGY_FAVOR_BOOKS.has(bookId)) score += 45;
  const dis = e.disambiguation?.trim() ?? '';
  if (dis && /城|地|地区| kingdom|place/i.test(dis) && PLACE_FAVOR_BOOKS.has(bookId)) {
    score += 35;
  }
  if (dis && /之子|之祖|人物|门徒|丈夫|妻子|母亲|父亲/.test(dis) && GENEALOGY_FAVOR_BOOKS.has(bookId)) {
    score += 35;
  }

  const scope = new Set((e.scope_books ?? []).map((b) => b.toUpperCase()));
  if (scope.has(bookId)) score += 80;

  const hint = BOOK_SENSE_HINTS[bookId];
  if (hint) {
    const blob = `${e.disambiguation ?? ''} ${e.summary ?? ''} ${(e.aliases ?? []).join(' ')}`;
    if (hint.test(blob)) score += 100;
  }

  for (const ref of e.refs ?? []) {
    const c = refCoords(ref.replace(/\./g, ' '));
    if (!c) continue;
    if (c.book === bookId) {
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

function choiceKey(name: string, bookId: string, chapter?: number): string {
  const base = `${CHOICE_PREFIX}${name}_${bookId.toUpperCase()}`;
  return chapter != null ? `${base}_c${chapter}` : base;
}

export function readDictChoice(name: string, bookId: string, chapter?: number): string | null {
  if (typeof window === 'undefined') return null;
  if (chapter != null) {
    const byChapter = localStorage.getItem(choiceKey(name, bookId, chapter));
    if (byChapter) return byChapter;
  }
  return localStorage.getItem(choiceKey(name, bookId));
}

export function writeDictChoice(name: string, bookId: string, entityId: string, chapter?: number) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(choiceKey(name, bookId), entityId);
  if (chapter != null) {
    localStorage.setItem(choiceKey(name, bookId, chapter), entityId);
  }
}

export function lookupDictCandidates(
  name: string,
  index: Map<string, DictEntity[]>,
  ctx: DictContext,
): DictEntity[] {
  const list = index.get(name) ?? [];
  if (list.length <= 1) return list;

  const remembered = readDictChoice(name, ctx.bookId, ctx.chapter);
  if (remembered) {
    const hit = list.find((e) => e.id === remembered);
    if (hit) return [hit];
  }

  return [...list].sort((a, b) => scoreEntity(b, ctx) - scoreEntity(a, ctx));
}

/** 是否存在明显次优义项（用于详情里展示「其他义项」切换，不再强制先选） */
export function hasAlternateSenses(candidates: DictEntity[], ctx: DictContext): boolean {
  return candidates.length > 1;
}

/** @deprecated 保留兼容；现默认直接展示最佳义项 */
export function needsDisambiguation(candidates: DictEntity[], ctx: DictContext): boolean {
  if (candidates.length <= 1) return false;
  const scores = candidates.map((c) => scoreEntity(c, ctx));
  // 分差足够大时视为已消歧，无需展示其他义项条
  if (scores[0] - scores[1] >= 50) return false;
  return true;
}

export function rankDictCandidates(
  candidates: DictEntity[],
  ctx: DictContext,
): DictEntity[] {
  return [...candidates].sort((a, b) => scoreEntity(b, ctx) - scoreEntity(a, ctx));
}

/** 低置信时不链正文，避免无关专名（尤其地点）误标。 */
export function shouldLinkDictEntity(
  candidates: DictEntity[],
  picked: DictEntity,
  ctx: DictContext,
): boolean {
  const scores = candidates.map((c) => scoreEntity(c, ctx));
  const topScore = scores[0] ?? 0;
  const secondScore = scores[1] ?? 0;
  if (candidates.length <= 1) {
    if (picked.type === 'place' && picked.name.length <= 2 && topScore < 30) return false;
    if (topScore < 15 && !(picked.refs?.length)) return false;
    return true;
  }
  if (topScore < 30) return false;
  if (topScore - secondScore < 50 && topScore < 80) return false;
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
