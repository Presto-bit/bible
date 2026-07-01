// 100 个成就徽章（本地计算，emoji 图标）

import { answerStats } from './daily_quiz';
import { aiQuizWins, quizCorrectCount } from './gamification';

export interface BadgeDef {
  id: string;
  label: string;
  desc: string;
  icon: string;
  done: boolean;
  progress: string;
}

type Ctx = {
  streak: number;
  readBooks: number;
  totalBooks: number;
  noteCount: number;
  monthDays: number;
  totalMinutes: number;
  totalChapters: number;
  highlightCount: number;
  planDays: number;
  friendCount: number;
};

function b(
  id: string,
  label: string,
  desc: string,
  icon: string,
  done: boolean,
  progress: string,
): BadgeDef {
  return { id, label, desc, icon, done, progress };
}

const STREAK_MILESTONES = [1, 3, 5, 7, 10, 14, 21, 30, 40, 50, 60, 90, 100, 120, 180, 200, 365];
const BOOK_MILESTONES = [1, 2, 3, 5, 7, 10, 15, 20, 27, 39, 50, 66];
const NOTE_MILESTONES = [1, 3, 5, 10, 20, 30, 50, 100];
const QUIZ_MILESTONES = [5, 10, 25, 50, 100, 200, 500, 1000];
const MINUTE_MILESTONES = [30, 60, 120, 300, 600, 1000, 2000, 5000];

const STREAK_ICONS = ['🌱', '🔥', '⭐', '💫', '🏅', '🎖', '🏆', '👑', '💎', '🌟', '✨', '🕯', '📿', '🙏', '⛪', '🕊', '🌈'];
const BOOK_ICONS = ['📖', '📕', '📗', '📘', '📙', '📚', '🗺', '🧭', '✝', '📜', '🏛', '🎓'];
const FUN_BADGES: { id: string; label: string; desc: string; icon: string; test: (c: Ctx) => boolean; progress: (c: Ctx) => string }[] = [
  { id: 'early_bird', label: '晨更达人', desc: '连续 7 天早晨读经', icon: '🌅', test: (c) => c.streak >= 7, progress: (c) => `${Math.min(c.streak, 7)}/7` },
  { id: 'night_owl', label: '夜读心友', desc: '累计读经 300 分钟', icon: '🌙', test: (c) => c.totalMinutes >= 300, progress: (c) => `${Math.min(c.totalMinutes, 300)}/300` },
  { id: 'highlighter', label: '划线收藏家', desc: '标记 20 处经文', icon: '🖍', test: (c) => c.highlightCount >= 20, progress: (c) => `${Math.min(c.highlightCount, 20)}/20` },
  { id: 'planner', label: '计划同行者', desc: '完成 7 天读经计划', icon: '📅', test: (c) => c.planDays >= 7, progress: (c) => `${Math.min(c.planDays, 7)}/7` },
  { id: 'social', label: '团契伙伴', desc: '添加 1 位好友', icon: '🤝', test: (c) => c.friendCount >= 1, progress: (c) => `${c.friendCount}/1` },
  { id: 'month_reader', label: '月度坚持', desc: '本月已读 15 天', icon: '📆', test: (c) => c.monthDays >= 15, progress: (c) => `${Math.min(c.monthDays, 15)}/15` },
  { id: 'chapter100', label: '百章里程碑', desc: '累计读完 100 章', icon: '💯', test: (c) => c.totalChapters >= 100, progress: (c) => `${Math.min(c.totalChapters, 100)}/100` },
  { id: 'nt_half', label: '新约半程', desc: '读完 14 卷新约书卷', icon: '🕊', test: (c) => c.readBooks >= 14, progress: (c) => `${Math.min(c.readBooks, 14)}/14` },
  { id: 'ot_explorer', label: '旧约探险', desc: '读完 20 卷旧约书卷', icon: '🏜', test: (c) => c.readBooks >= 20, progress: (c) => `${Math.min(c.readBooks, 20)}/20` },
  { id: 'bible_complete', label: '圣经通读者', desc: '读完 66 卷', icon: '🌍', test: (c) => c.readBooks >= 66, progress: (c) => `${Math.min(c.readBooks, 66)}/66` },
  { id: 'daily_quiz7', label: '问答周冠军', desc: '累计答对 50 道每日问答', icon: '❓', test: () => answerStats().correct >= 50, progress: () => `${Math.min(answerStats().correct, 50)}/50` },
  { id: 'ai_friend', label: '小爱密友', desc: '完成 10 次 AI 闯关', icon: '✦', test: () => aiQuizWins() >= 10, progress: () => `${Math.min(aiQuizWins(), 10)}/10` },
];

export function computeAllBadges(ctx: Ctx): BadgeDef[] {
  const out: BadgeDef[] = [];
  const quiz = quizCorrectCount();

  STREAK_MILESTONES.forEach((n, i) => {
    out.push(
      b(
        `streak_${n}`,
        n === 1 ? '初识经文' : n === 7 ? '连续一周' : n === 30 ? '月度坚持' : n === 365 ? '全年同行' : `连续 ${n} 天`,
        `连续读经打卡 ${n} 天`,
        STREAK_ICONS[i % STREAK_ICONS.length],
        ctx.streak >= n,
        `${Math.min(ctx.streak, n)}/${n}`,
      ),
    );
  });

  BOOK_MILESTONES.forEach((n, i) => {
    out.push(
      b(
        `books_${n}`,
        n === 66 ? '全经通读' : n === 27 ? '新约通读' : `读完 ${n} 卷`,
        `探索圣经各卷`,
        BOOK_ICONS[i % BOOK_ICONS.length],
        ctx.readBooks >= n,
        `${Math.min(ctx.readBooks, n)}/${n}`,
      ),
    );
  });

  NOTE_MILESTONES.forEach((n, i) => {
    out.push(
      b(
        `notes_${n}`,
        `${n} 条笔记`,
        '记录灵修心得',
        ['✎', '📝', '📓', '📔', '📒', '🗒', '💬', '📋'][i % 8],
        ctx.noteCount >= n,
        `${Math.min(ctx.noteCount, n)}/${n}`,
      ),
    );
  });

  QUIZ_MILESTONES.forEach((n, i) => {
    out.push(
      b(
        `quiz_${n}`,
        `答对 ${n} 题`,
        '知识挑战积累',
        ['🃏', '🎯', '🧠', '🏅', '🎲', '📊', '🏆', '👑'][i % 8],
        quiz >= n,
        `${Math.min(quiz, n)}/${n}`,
      ),
    );
  });

  MINUTE_MILESTONES.forEach((n, i) => {
    out.push(
      b(
        `min_${n}`,
        `${n} 分钟`,
        '累计读经时长',
        ['⏱', '⌛', '⏳', '🕐', '🕑', '🕒', '🕓', '🕔'][i % 8],
        ctx.totalMinutes >= n,
        `${Math.min(ctx.totalMinutes, n)}/${n}`,
      ),
    );
  });

  for (const fb of FUN_BADGES) {
    out.push(b(fb.id, fb.label, fb.desc, fb.icon, fb.test(ctx), fb.progress(ctx)));
  }

  // 补齐到 100 个：章节细分里程碑
  const chTargets = [10, 25, 50, 75, 150, 200, 300, 400, 500, 750];
  chTargets.forEach((n, i) => {
    if (out.length >= 100) return;
    out.push(
      b(
        `ch_${n}`,
        `${n} 章`,
        '累计读完章节',
        ['📄', '📃', '📑', '🔖', '🏷', '📎', '📌', '📍', '🗂', '📁'][i % 10],
        ctx.totalChapters >= n,
        `${Math.min(ctx.totalChapters, n)}/${n}`,
      ),
    );
  });

  // 仍不足 100 则加「探索者」系列
  let k = 0;
  while (out.length < 100) {
    const n = 5 + k;
    out.push(
      b(
        `explorer_${k}`,
        `探索者 Lv.${k + 1}`,
        `读经旅程第 ${n} 个里程碑`,
        ['🧭', '🌿', '🍃', '🌾', '🌻', '🌺', '🌸', '🌼'][k % 8],
        ctx.totalMinutes >= n * 10,
        `${Math.min(ctx.totalMinutes, n * 10)}/${n * 10}`,
      ),
    );
    k++;
  }

  return out.slice(0, 100);
}
