// 经典关卡：从 question_bank.json 按主题/经卷确定性抽题（每关 5 题）。

import {
  QUESTION_BANK,
  questionsByTheme,
  seededShuffle,
  type QuestionBankEntry,
} from './question_bank';

export interface ChallengeQuestion {
  id: string;
  question: string;
  options: string[];
  answer: number;
  explain: string;
  ref?: string;
}

export interface ChallengeLevel {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  bookId?: string;
  questions: ChallengeQuestion[];
}

interface ClassicLevelSpec {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  themeId: string;
  /** 优先选用 ref 前缀匹配的题（不足则回退整主题） */
  refPrefix?: string;
}

const CLASSIC_LEVEL_SPECS: ClassicLevelSpec[] = [
  { id: 'lv1', title: '第 1 关', subtitle: '福音核心', icon: '✝', themeId: 'gospel' },
  { id: 'lv2', title: '第 2 关', subtitle: '旧约人物', icon: '👤', themeId: 'ot_people' },
  { id: 'lv3', title: '第 3 关', subtitle: '新约书信', icon: '✉', themeId: 'nt_letters' },
  { id: 'lv4', title: '第 4 关', subtitle: '登山宝训', icon: '⛰', themeId: 'sermon' },
  { id: 'lv5', title: '第 5 关', subtitle: '约翰福音 3 章', icon: '💧', themeId: 'gospel', refPrefix: 'JHN.3' },
  { id: 'lv6', title: '第 6 关', subtitle: '诗篇 23 篇', icon: '🎵', themeId: 'psalms', refPrefix: 'PSA.23' },
  { id: 'lv7', title: '第 7 关', subtitle: '创世记开端', icon: '🌍', themeId: 'law', refPrefix: 'GEN.' },
  { id: 'lv8', title: '第 8 关', subtitle: '使徒行传', icon: '🔥', themeId: 'acts' },
  { id: 'lv9', title: '第 9 关', subtitle: '罗马书', icon: '📜', themeId: 'nt_letters', refPrefix: 'ROM.' },
  { id: 'lv10', title: '第 10 关', subtitle: '箴言智慧', icon: '💡', themeId: 'psalms', refPrefix: 'PRO.' },
  { id: 'lv11', title: '第 11 关', subtitle: '以赛亚书', icon: '🕊', themeId: 'prophets', refPrefix: 'ISA.' },
  { id: 'lv12', title: '第 12 关', subtitle: '启示录', icon: '👑', themeId: 'revelation' },
];

const QUESTIONS_PER_LEVEL = 5;

function pickLevelQuestions(spec: ClassicLevelSpec): QuestionBankEntry[] {
  let pool = questionsByTheme(spec.themeId);
  if (spec.refPrefix) {
    const prefix = spec.refPrefix.toUpperCase();
    const filtered = pool.filter((q) => (q.ref ?? '').toUpperCase().startsWith(prefix));
    if (filtered.length >= QUESTIONS_PER_LEVEL) pool = filtered;
  }
  if (!pool.length) pool = [...QUESTION_BANK];
  return seededShuffle(pool, spec.id).slice(0, QUESTIONS_PER_LEVEL);
}

function buildClassicLevels(): ChallengeLevel[] {
  return CLASSIC_LEVEL_SPECS.map((spec) => ({
    id: spec.id,
    title: spec.title,
    subtitle: spec.subtitle,
    icon: spec.icon,
    questions: pickLevelQuestions(spec),
  }));
}

let classicCache: ChallengeLevel[] | null = null;

export function getClassicLevels(): ChallengeLevel[] {
  if (!classicCache) classicCache = buildClassicLevels();
  return classicCache;
}

/** @deprecated 使用 getClassicLevels()；保留兼容旧 import */
export const CHALLENGE_LEVELS = getClassicLevels();

export function bookChallengeLevel(bookId: string, bookName: string): ChallengeLevel {
  const bid = bookId.toUpperCase();
  const prefix = `${bid}.`;
  let pool = QUESTION_BANK.filter((q) => (q.ref ?? '').toUpperCase().startsWith(prefix));
  if (pool.length < QUESTIONS_PER_LEVEL) {
    pool = seededShuffle(QUESTION_BANK, `book-fallback-${bid}`);
  }
  return {
    id: `book-${bid}`,
    title: `${bookName} · 巩固关`,
    subtitle: '读完本卷后的知识回顾',
    icon: '📖',
    bookId: bid,
    questions: seededShuffle(pool, `book-${bid}`).slice(0, QUESTIONS_PER_LEVEL),
  };
}

export function allChallengeLevels(extra?: ChallengeLevel[]): ChallengeLevel[] {
  return [...getClassicLevels(), ...(extra ?? [])];
}

export function flattenQuestions(levels: ChallengeLevel[]): ChallengeQuestion[] {
  return levels.flatMap((l) => l.questions);
}
