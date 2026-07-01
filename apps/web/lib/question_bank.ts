// 题库：1150+ 道，按主题分类 + 随机模式

import bankData from '@/data/question_bank.json';
import type { ChallengeQuestion } from './challenge_levels';

export interface QuestionBankEntry extends ChallengeQuestion {
  theme: string;
  themeId: string;
}

export interface ThemeInfo {
  id: string;
  name: string;
}

const bank = bankData as {
  questions: QuestionBankEntry[];
  themes: ThemeInfo[];
  count: number;
};

export const QUESTION_BANK: QuestionBankEntry[] = bank.questions;
export const QUESTION_THEMES: ThemeInfo[] = bank.themes;
export const QUESTION_BANK_SIZE = bank.count;

export function questionsByTheme(themeId: string): QuestionBankEntry[] {
  return QUESTION_BANK.filter((q) => q.themeId === themeId);
}

export function randomQuestions(count: number, exclude?: Set<string>): QuestionBankEntry[] {
  const pool = exclude
    ? QUESTION_BANK.filter((q) => !exclude.has(q.id))
    : [...QUESTION_BANK];
  const out: QuestionBankEntry[] = [];
  const used = new Set<string>();
  while (out.length < count && pool.length > 0) {
    const i = Math.floor(Math.random() * pool.length);
    const q = pool.splice(i, 1)[0];
    if (used.has(q.id)) continue;
    used.add(q.id);
    out.push(q);
  }
  return out;
}

/** 确定性洗牌（种子为日期字符串） */
export function seededShuffle<T>(items: T[], seed: string): T[] {
  const arr = [...items];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  for (let i = arr.length - 1; i > 0; i--) {
    h = (h * 1664525 + 1013904223) >>> 0;
    const j = h % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function themeLevelQuestions(themeId: string, perLevel = 5): QuestionBankEntry[] {
  return seededShuffle(questionsByTheme(themeId), themeId).slice(0, perLevel);
}
