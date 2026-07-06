// 每日问答：5 道题，优先未答过或答错的题

import { QUESTION_BANK, seededShuffle, type QuestionBankEntry } from './question_bank';

const HISTORY_KEY = 'presto_q_answer_history';
const DAILY_KEY = 'presto_daily_quiz_day';

export interface AnswerRecord {
  correct: boolean;
  at: string; // YYYY-MM-DD
}

function ymd(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function readHistory(): Record<string, AnswerRecord> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '{}') as Record<string, AnswerRecord>;
  } catch {
    return {};
  }
}

export function recordAnswer(questionId: string, correct: boolean) {
  const h = readHistory();
  const wasWrong = h[questionId] && !h[questionId].correct;
  h[questionId] = { correct, at: ymd() };
  localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
  if (wasWrong && correct) {
    void import('./badge_events').then((m) => m.recordWrongRevived());
  }
}

export function answerStats() {
  const h = readHistory();
  let correct = 0;
  let wrong = 0;
  for (const v of Object.values(h)) {
    if (v.correct) correct++;
    else wrong++;
  }
  const total = correct + wrong;
  const accuracyPct = total > 0 ? Math.round((correct / total) * 100) : 0;
  return { correct, wrong, total, accuracyPct };
}

/** 答错过的题目 ID（最近一次答错） */
export function wrongQuestionIds(): string[] {
  const h = readHistory();
  return Object.entries(h)
    .filter(([, v]) => !v.correct)
    .map(([id]) => id);
}

/** 今日 5 题：未答或答错优先；不足则从全库补 */
export function dailyQuizQuestions(count = 5): QuestionBankEntry[] {
  const today = ymd();
  const cached = typeof window !== 'undefined' ? localStorage.getItem(DAILY_KEY) : null;
  if (cached) {
    try {
      const { day, ids } = JSON.parse(cached) as { day: string; ids: string[] };
      if (day === today && ids.length === count) {
        const map = new Map(QUESTION_BANK.map((q) => [q.id, q]));
        const qs = ids.map((id) => map.get(id)).filter(Boolean) as QuestionBankEntry[];
        if (qs.length === count) return qs;
      }
    } catch { /* regenerate */ }
  }

  const history = readHistory();
  const unseenOrWrong = QUESTION_BANK.filter((q) => {
    const r = history[q.id];
    return !r || !r.correct;
  });
  const wrongFirst = [
    ...unseenOrWrong.filter((q) => history[q.id] && !history[q.id].correct),
    ...unseenOrWrong.filter((q) => !history[q.id]),
  ];
  let picked = seededShuffle(wrongFirst, today).slice(0, count);
  if (picked.length < count) {
    const used = new Set(picked.map((q) => q.id));
    const rest = seededShuffle(
      QUESTION_BANK.filter((q) => !used.has(q.id)),
      `${today}-fill`,
    );
    picked = [...picked, ...rest.slice(0, count - picked.length)];
  }
  if (typeof window !== 'undefined') {
    localStorage.setItem(DAILY_KEY, JSON.stringify({ day: today, ids: picked.map((q) => q.id) }));
  }
  return picked;
}

export function dailyQuizDone(): boolean {
  const today = ymd();
  const cached = typeof window !== 'undefined' ? localStorage.getItem(DAILY_KEY) : null;
  if (!cached) return false;
  try {
    const { day, done } = JSON.parse(cached) as { day: string; done?: boolean };
    return day === today && !!done;
  } catch {
    return false;
  }
}

export function markDailyQuizDone() {
  const today = ymd();
  const cached = typeof window !== 'undefined' ? localStorage.getItem(DAILY_KEY) : null;
  let ids: string[] = [];
  if (cached) {
    try {
      ids = (JSON.parse(cached) as { ids?: string[] }).ids ?? [];
    } catch { /* ignore */ }
  }
  localStorage.setItem(DAILY_KEY, JSON.stringify({ day: today, ids, done: true }));
}
