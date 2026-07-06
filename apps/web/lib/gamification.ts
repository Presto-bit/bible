// 游戏化：连续打卡、徽章、知识卡、节期活动、小爱闯关（本地优先）。

import { dailyMinutes, type DayLog } from './reading';

const LOG_KEY = 'presto_reading_log';
const QUIZ_PROGRESS_KEY = 'presto_quiz_progress';
const AI_QUIZ_KEY = 'presto_ai_quiz_progress';

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function readLogs(): Record<string, DayLog> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(LOG_KEY) || '{}') as Record<string, DayLog>;
  } catch {
    return {};
  }
}

function activeDay(logs: Record<string, DayLog>, date: string): boolean {
  const l = logs[date];
  return !!l && (l.minutes > 0 || l.chapters > 0);
}

/** 连续读经打卡天数（含今日）。 */
export function readingStreak(): number {
  const logs = readLogs();
  const d = new Date();
  let streak = 0;
  // 今日未读则从昨天起算。
  if (!activeDay(logs, ymd(d))) d.setDate(d.getDate() - 1);
  for (let i = 0; i < 400; i++) {
    if (!activeDay(logs, ymd(d))) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

// ── 知识挑战卡 ──

export interface QuizCard {
  id: string;
  category: string;
  question: string;
  options: string[];
  answer: number;
  explain: string;
  ref?: string;
}

export const QUIZ_CARDS: QuizCard[] = [
  {
    id: 'q1',
    category: '经文识记',
    question: '「神爱世人」出自哪卷书？',
    options: ['约翰福音', '罗马书', '诗篇', '创世记'],
    answer: 0,
    explain: '约翰福音 3:16 是福音核心经句。',
    ref: 'JHN.3.16',
  },
  {
    id: 'q2',
    category: '人物',
    question: '谁建造方舟？',
    options: ['亚伯拉罕', '挪亚', '摩西', '大卫'],
    answer: 1,
    explain: '挪亚照神吩咐建造方舟（创 6–9）。',
    ref: 'GEN.6.14',
  },
  {
    id: 'q3',
    category: '地理',
    question: '耶稣在哪个城市诞生？',
    options: ['耶路撒冷', '伯利恒', '拿撒勒', '迦百农'],
    answer: 1,
    explain: '弥迦书预言，耶稣生于伯利恒。',
    ref: 'MAT.2.1',
  },
  {
    id: 'q4',
    category: '经文识记',
    question: '「耶和华是我的牧者」出自？',
    options: ['诗篇 23', '箴言 3', '以赛亚 40', '约翰福音 10'],
    answer: 0,
    explain: '诗篇 23 篇开头。',
    ref: 'PSA.23.1',
  },
  {
    id: 'q5',
    category: '应用',
    question: '「爱人如己」出现在哪段教导中？',
    options: ['十诫', '登山宝训', '使徒行传', '启示录'],
    answer: 1,
    explain: '耶稣在登山宝训中总结律法和先知。',
    ref: 'MAT.22.39',
  },
  {
    id: 'q6',
    category: '人物',
    question: '谁写下大部分新约书信？',
    options: ['彼得', '保罗', '约翰', '雅各'],
    answer: 1,
    explain: '保罗写了罗马书至腓利门等多卷书信。',
    ref: 'ROM.1.1',
  },
];

export function quizProgress(): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(QUIZ_PROGRESS_KEY) || '{}');
  } catch {
    return {};
  }
}

export function markQuizCorrect(id: string) {
  const p = quizProgress();
  p[id] = true;
  localStorage.setItem(QUIZ_PROGRESS_KEY, JSON.stringify(p));
}

export function quizCorrectCount(): number {
  return Object.values(quizProgress()).filter(Boolean).length;
}

// ── 小爱问答闯关 ──

export interface AiQuizLevel {
  id: string;
  title: string;
  ref: string;
  questions: { q: string; options: string[]; answer: number }[];
}

export const AI_QUIZ_LEVELS: AiQuizLevel[] = [
  {
    id: 'jhn3',
    title: '约翰福音 3 章',
    ref: 'JHN.3',
    questions: [
      {
        q: '「重生」在本章主要指什么？',
        options: ['从母腹再生', '从圣灵生', '遵守律法', '受割礼'],
        answer: 1,
      },
      {
        q: '神赐下儿子的目的是？',
        options: ['审判世界', '叫世人灭亡', '叫世人因祂得救', '建立国度'],
        answer: 2,
      },
    ],
  },
  {
    id: 'psa23',
    title: '诗篇 23 篇',
    ref: 'PSA.23',
    questions: [
      {
        q: '「牧者」在本诗象征什么？',
        options: ['君王', '耶和华看顾', '大卫自己', '祭司'],
        answer: 1,
      },
      {
        q: '「我虽然行过死荫的幽谷」表达？',
        options: ['绝望', '神同在的安慰', '惩罚', '迷路'],
        answer: 1,
      },
    ],
  },
];

export function aiQuizWins(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = JSON.parse(localStorage.getItem(AI_QUIZ_KEY) || '{}');
    return Object.values(raw as Record<string, boolean>).filter(Boolean).length;
  } catch {
    return 0;
  }
}

export function markAiQuizWin(id: string) {
  const raw = aiQuizWins() >= 0 ? JSON.parse(localStorage.getItem(AI_QUIZ_KEY) || '{}') : {};
  (raw as Record<string, boolean>)[id] = true;
  localStorage.setItem(AI_QUIZ_KEY, JSON.stringify(raw));
}

// ── 季节/节期活动 ──

export interface SeasonalEvent {
  id: string;
  title: string;
  subtitle: string;
  theme: string;
  href: string;
  badge?: string;
}

export function currentSeasonalEvents(): SeasonalEvent[] {
  const m = new Date().getMonth() + 1;
  const events: SeasonalEvent[] = [];
  if (m === 12 || m === 1) {
    events.push({
      id: 'advent',
      title: '圣诞季 · 道成肉身',
      subtitle: '12月–1月专题读经',
      theme: '降生',
      href: '/reader?book=MAT&chapter=2',
      badge: '圣诞',
    });
  }
  if (m >= 3 && m <= 4) {
    events.push({
      id: 'easter',
      title: '复活节 · 胜过死亡',
      subtitle: '受难周与复活专题',
      theme: '复活',
      href: '/reader?book=MRK&chapter=16',
      badge: '复活节',
    });
  }
  if (m === 9) {
    events.push({
      id: 'autumn',
      title: '秋收感恩',
      subtitle: '数算恩典专题',
      theme: '感恩',
      href: '/reader?book=PSA&chapter=100',
      badge: '感恩',
    });
  }
  return events;
}

/** 今日是否已读经（用于火焰展示）。 */
export function readToday(): boolean {
  return (dailyMinutes()[ymd(new Date())] || 0) > 0 || readingStreak() > 0;
}
