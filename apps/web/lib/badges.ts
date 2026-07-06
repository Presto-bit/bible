// 成就徽章（精简坚持类 + 探索/小爱/灵修/群体/彩蛋）

import { readEvents } from './reading';
import { maxGroupCheckinStreak, type BadgeStats } from './badge_events';

export type BadgeCategory =
  | 'persistence'
  | 'explore'
  | 'xiaoai'
  | 'devotional'
  | 'social'
  | 'easter_egg';

export const BADGE_CATEGORY_LABELS: Record<BadgeCategory, string> = {
  persistence: '坚持',
  explore: '探索',
  xiaoai: '小爱',
  devotional: '灵修',
  social: '群体',
  easter_egg: '彩蛋',
};

export const BADGE_CATEGORY_ORDER: BadgeCategory[] = [
  'persistence',
  'explore',
  'xiaoai',
  'devotional',
  'social',
  'easter_egg',
];

export interface BadgeDef {
  id: string;
  label: string;
  desc: string;
  hint: string;
  icon: string;
  category: BadgeCategory;
  done: boolean;
  progress: string;
  interesting: boolean;
  unlockedAt?: number;
}

export type BadgeCtx = {
  streak: number;
  readBooks: number;
  ntBooksRead: number;
  otBooksRead: number;
  totalBooks: number;
  noteCount: number;
  monthDays: number;
  totalMinutes: number;
  totalChapters: number;
  highlightCount: number;
  highlightColors: number;
  bookmarkCount: number;
  thoughtCount: number;
  maxNoteLen: number;
  planDays: number;
  friendCount: number;
  bookTotals: Record<string, number>;
  stats: BadgeStats;
};

function ymd(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function hasChapter(book: string, chapter: number): boolean {
  return readEvents().some((e) => e.book === book && e.chapter === chapter);
}

function readVerseRefs(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = JSON.parse(localStorage.getItem('presto_verse_events') || '[]') as { ref: string }[];
    return Array.isArray(raw) ? raw.map((e) => e.ref.toUpperCase()) : [];
  } catch {
    return [];
  }
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

function tripleSceneSameRef(stats: BadgeStats): boolean {
  return Object.values(stats.ref_scenes).some((scenes) => scenes.length >= 3);
}

function badge(
  id: string,
  label: string,
  desc: string,
  hint: string,
  icon: string,
  category: BadgeCategory,
  done: boolean,
  progress: string,
  interesting = category !== 'persistence',
): BadgeDef {
  return { id, label, desc, hint, icon, category, done, progress, interesting };
}

export function computeAllBadges(ctx: BadgeCtx): BadgeDef[] {
  const s = ctx.stats;
  const checkinStreak = maxGroupCheckinStreak(s);

  return [
    // ── 坚持（8）──
    badge('streak_1', '初识经文', '迈出读经第一步', '连续读经 1 天', '🌱', 'persistence', ctx.streak >= 1, `${Math.min(ctx.streak, 1)}/1`, false),
    badge('streak_7', '连续一周', '七天同行', '连续读经 7 天', '🔥', 'persistence', ctx.streak >= 7, `${Math.min(ctx.streak, 7)}/7`, false),
    badge('streak_30', '月度同行', '三十日坚持', '连续读经 30 天', '🏅', 'persistence', ctx.streak >= 30, `${Math.min(ctx.streak, 30)}/30`, false),
    badge('streak_365', '全年守望', '与神同行一整年', '连续读经 365 天', '👑', 'persistence', ctx.streak >= 365, `${Math.min(ctx.streak, 365)}/365`, true),

    badge('books_5', '五卷起步', '探索五卷书卷', '读过 5 卷不同书卷', '📖', 'persistence', ctx.readBooks >= 5, `${Math.min(ctx.readBooks, 5)}/5`, false),
    badge('books_27', '新约通读', '新约二十七卷均有足迹', '新约 27 卷均有阅读', '✝', 'persistence', ctx.ntBooksRead >= 27, `${Math.min(ctx.ntBooksRead, 27)}/27`, true),
    badge('books_20_ot', '旧约旅人', '旧约二十卷均有足迹', '旧约 20 卷均有阅读', '🏜', 'persistence', ctx.otBooksRead >= 20, `${Math.min(ctx.otBooksRead, 20)}/20`, true),
    badge('books_66', '全经行者', '六十六卷均有足迹', '66 卷均有阅读', '🌍', 'persistence', ctx.readBooks >= 66, `${Math.min(ctx.readBooks, 66)}/66`, true),

    // ── 探索（10）──
    badge('crossref_first', '串珠初探', '看见经文之间的关联', '打开串珠工具 1 次', '🔗', 'explore', s.crossref_open >= 1, `${Math.min(s.crossref_open, 1)}/1`),
    badge('strongs_first', '原文好奇者', '追溯词语根源', '查看 Strong 编号 1 次', '🔤', 'explore', s.strongs_open >= 1, `${Math.min(s.strongs_open, 1)}/1`),
    badge('parallel_reader', '对照读者', '多译本并排阅读', '对照模式读完 1 章', '📑', 'explore', s.parallel_chapters >= 1, `${Math.min(s.parallel_chapters, 1)}/1`),
    badge('dict_3', '词典旅人', '认识圣经人物与地名', '查阅 3 个不同词条', '📚', 'explore', s.dict_entities.length >= 3, `${Math.min(s.dict_entities.length, 3)}/3`),
    badge('map_tour', '地图行者', '在地图上行走故事', '展开一个地图故事专题', '🗺', 'explore', s.map_tours.length >= 1, `${Math.min(s.map_tours.length, 1)}/1`),
    badge('timeline_tour', '时间旅人', '沿时间线追溯历史', '展开一个时间线专题', '⏳', 'explore', s.timeline_tours.length >= 1, `${Math.min(s.timeline_tours.length, 1)}/1`),
    badge('topic_3', '主题采撷', '按主题发现经文', '浏览 3 个不同主题页', '🌿', 'explore', s.topic_ids.length >= 3, `${Math.min(s.topic_ids.length, 3)}/3`),
    badge('short_book_complete', '整卷速读', '一口气读完短篇书卷', '读完 1 卷 10 章以内的书', '⚡', 'explore', shortBookCompleted(ctx.bookTotals), shortBookCompleted(ctx.bookTotals) ? '1/1' : '0/1'),
    badge('psalm_day_15', '诗篇一日', '一日诗篇漫游', '同一天读 15 篇不同诗篇', '🎵', 'explore', psalmsToday() >= 15, `${Math.min(psalmsToday(), 15)}/15`),
    badge('four_gospels', '四福音巡游', '四福音各读一章', '马太、马可、路加、约翰各读 1 章', '🕊', 'explore', gospelsStarted() >= 4, `${Math.min(gospelsStarted(), 4)}/4`),

    // ── 小爱（8）──
    badge('xiaoai_first', '初次请教', '向小爱提出第一个问题', '向小爱提问 1 次', '✦', 'xiaoai', s.xiaoai_questions >= 1, `${Math.min(s.xiaoai_questions, 1)}/1`),
    badge('citation_first', '脚注学者', '顺藤摸瓜读出处', '点击脚注引用 1 次', '📎', 'xiaoai', s.citation_clicks >= 1, `${Math.min(s.citation_clicks, 1)}/1`),
    badge('save_answer_note', '存笔记达人', '把亮光存下来', '从小爱回答存笔记 1 次', '📝', 'xiaoai', s.save_answer_notes >= 1, `${Math.min(s.save_answer_notes, 1)}/1`),
    badge('followup_3', '追问三连', '刨根问底', '同一会话连续追问 3 次', '💬', 'xiaoai', s.max_followups_session >= 3, `${Math.min(s.max_followups_session, 3)}/3`),
    badge('half_sheet', '半屏知己', '阅读中随时请教', '使用半屏小爱 1 次', '📱', 'xiaoai', s.half_sheet_xiaoai >= 1, `${Math.min(s.half_sheet_xiaoai, 1)}/1`),
    badge('life_apply', '生活应用派', '把真理带入生活', '使用「生活应用」场景提问', '🌱', 'xiaoai', s.scenes_used.includes('chat_apply'), s.scenes_used.includes('chat_apply') ? '1/1' : '0/1'),
    badge('triple_scene', '同一节三重奏', '多角度认识一节经文', '对同一节经文用 3 种场景提问', '🎼', 'xiaoai', tripleSceneSameRef(s), tripleSceneSameRef(s) ? '3/3' : `${Math.max(0, ...Object.values(s.ref_scenes).map((a) => a.length), 0)}/3`),
    badge('share_answer', '分享亮光', '把好答案分享出去', '分享小爱回答 1 次', '📤', 'xiaoai', s.share_answers >= 1, `${Math.min(s.share_answers, 1)}/1`),

    // ── 灵修（6）──
    badge('note_first', '首笔心得', '记录第一段感动', '写 1 条笔记', '✎', 'devotional', ctx.noteCount >= 1, `${Math.min(ctx.noteCount, 1)}/1`, false),
    badge('note_deep', '深度反思', '沉潜思考', '单条笔记不少于 100 字', '📓', 'devotional', ctx.maxNoteLen >= 100, `${Math.min(ctx.maxNoteLen, 100)}/100`),
    badge('highlight_3', '彩色经文', '用颜色标记重点', '使用 3 种不同划线颜色', '🖍', 'devotional', ctx.highlightColors >= 3, `${Math.min(ctx.highlightColors, 3)}/3`),
    badge('bookmark_10', '书签收藏家', '珍藏重要经节', '收藏 10 节经文', '🔖', 'devotional', ctx.bookmarkCount >= 10, `${Math.min(ctx.bookmarkCount, 10)}/10`),
    badge('thought_first', '想法发布者', '分享读经想法', '发布 1 条读经想法', '💭', 'devotional', ctx.thoughtCount >= 1, `${Math.min(ctx.thoughtCount, 1)}/1`),
    badge('memory_review', '复习卡片', '温故知新', '从收藏复习进入阅读 1 次', '🃏', 'devotional', s.memory_reviews >= 1, `${Math.min(s.memory_reviews, 1)}/1`),

    // ── 群体（6）──
    badge('checkin_first', '第一次打卡', '在群体中见证', '在共读群打卡 1 次', '📍', 'social', s.group_checkins >= 1, `${Math.min(s.group_checkins, 1)}/1`),
    badge('checkin_streak_7', '守群人', '与群友彼此守望', '同一群连续打卡 7 天', '🛡', 'social', checkinStreak >= 7, `${Math.min(checkinStreak, 7)}/7`),
    badge('respond_first', '回应同伴', '彼此鼓励', '回应群友打卡 1 次', '🤝', 'social', s.group_responses >= 1, `${Math.min(s.group_responses, 1)}/1`),
    badge('group_create', '群主初任', '发起共读', '创建 1 个共读群', '👥', 'social', s.groups_created >= 1, `${Math.min(s.groups_created, 1)}/1`),
    badge('plan_share', '计划同行', '与群一起读计划', '将读经计划分享到群', '📅', 'social', s.plan_shared_group, s.plan_shared_group ? '1/1' : '0/1'),
    badge('invite_accept', '邀请使者', '应邀加入群体', '接受 1 次群邀请', '✉', 'social', s.invites_accepted >= 1, `${Math.min(s.invites_accepted, 1)}/1`),

    // ── 彩蛋（6，不含节期）──
    badge('jas_short', '最短的一节', '遇见雅 4:15', '阅读雅 4:15', '📏', 'easter_egg', hasVerseRef('JAS.4.15'), hasVerseRef('JAS.4.15') ? '1/1' : '0/1'),
    badge('ps119', '最长的一章', '读完诗 119 篇', '阅读诗 119 篇', '📜', 'easter_egg', hasChapter('PSA', 119), hasChapter('PSA', 119) ? '1/1' : '0/1'),
    badge('twelve_apostles', '十二使徒', '读太 10 章', '阅读太 10 章', '🐟', 'easter_egg', hasChapter('MAT', 10), hasChapter('MAT', 10) ? '1/1' : '0/1'),
    badge('prodigal', '浪子回家', '读路 15 章', '阅读路 15 章', '🏠', 'easter_egg', hasChapter('LUK', 15), hasChapter('LUK', 15) ? '1/1' : '0/1'),
    badge('night_xiaoai', 'Still Small Voice', '深夜向小爱倾诉', '23:00–5:00 向小爱提问', '🌙', 'easter_egg', s.night_xiaoai, s.night_xiaoai ? '1/1' : '0/1'),
    badge('wrong_revive', '错题复活', '把错题重新答对', '累计复活 5 道错题', '🔄', 'easter_egg', s.wrong_revived >= 5, `${Math.min(s.wrong_revived, 5)}/5`),
  ];
}
