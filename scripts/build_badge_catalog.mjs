#!/usr/bin/env node
/**
 * 从成就元数据生成 shared/badges.json（Web / Mobile 共用契约）
 */
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const categories = {
  persistence: '坚持',
  explore: '探索',
  xiaoai: '小爱',
  devotional: '灵修',
  social: '群体',
  easter_egg: '彩蛋',
};

const categoryOrder = [
  'persistence',
  'explore',
  'xiaoai',
  'devotional',
  'social',
  'easter_egg',
];

/** [id, label, desc, hint, icon, category, interesting, rule, progress] */
const rows = [
  ['streak_1', '初识经文', '迈出读经第一步', '连续读经 1 天', '🌱', 'persistence', false, { type: 'ctx_gte', field: 'streak', value: 1 }, { type: 'ratio', field: 'streak', max: 1 }],
  ['streak_7', '连续一周', '七天同行', '连续读经 7 天', '🔥', 'persistence', false, { type: 'ctx_gte', field: 'streak', value: 7 }, { type: 'ratio', field: 'streak', max: 7 }],
  ['streak_30', '月度同行', '三十日坚持', '连续读经 30 天', '🏅', 'persistence', false, { type: 'ctx_gte', field: 'streak', value: 30 }, { type: 'ratio', field: 'streak', max: 30 }],
  ['streak_365', '全年守望', '与神同行一整年', '连续读经 365 天', '👑', 'persistence', true, { type: 'ctx_gte', field: 'streak', value: 365 }, { type: 'ratio', field: 'streak', max: 365 }],
  ['books_5', '五卷起步', '探索五卷书卷', '读过 5 卷不同书卷', '📖', 'persistence', false, { type: 'ctx_gte', field: 'readBooks', value: 5 }, { type: 'ratio', field: 'readBooks', max: 5 }],
  ['books_27', '新约通读', '新约二十七卷均有足迹', '新约 27 卷均有阅读', '✝', 'persistence', true, { type: 'ctx_gte', field: 'ntBooksRead', value: 27 }, { type: 'ratio', field: 'ntBooksRead', max: 27 }],
  ['books_20_ot', '旧约旅人', '旧约二十卷均有足迹', '旧约 20 卷均有阅读', '🏜', 'persistence', true, { type: 'ctx_gte', field: 'otBooksRead', value: 20 }, { type: 'ratio', field: 'otBooksRead', max: 20 }],
  ['books_66', '全经行者', '六十六卷均有足迹', '66 卷均有阅读', '🌍', 'persistence', true, { type: 'ctx_gte', field: 'readBooks', value: 66 }, { type: 'ratio', field: 'readBooks', max: 66 }],
  ['crossref_first', '串珠初探', '看见经文之间的关联', '打开串珠工具 1 次', '🔗', 'explore', true, { type: 'stats_gte', field: 'crossref_open', value: 1 }, { type: 'ratio', field: 'stats.crossref_open', max: 1 }],
  ['strongs_first', '原文好奇者', '追溯词语根源', '查看 Strong 编号 1 次', '🔤', 'explore', true, { type: 'stats_gte', field: 'strongs_open', value: 1 }, { type: 'ratio', field: 'stats.strongs_open', max: 1 }],
  ['parallel_reader', '对照读者', '多译本并排阅读', '对照模式读完 1 章', '📑', 'explore', true, { type: 'stats_gte', field: 'parallel_chapters', value: 1 }, { type: 'ratio', field: 'stats.parallel_chapters', max: 1 }],
  ['dict_3', '词典旅人', '认识圣经人物与地名', '查阅 3 个不同词条', '📚', 'explore', true, { type: 'stats_array_len_gte', field: 'dict_entities', value: 3 }, { type: 'ratio', field: 'stats.dict_entities.length', max: 3 }],
  ['map_tour', '地图行者', '在地图上行走故事', '展开一个地图故事专题', '🗺', 'explore', true, { type: 'stats_array_len_gte', field: 'map_tours', value: 1 }, { type: 'ratio', field: 'stats.map_tours.length', max: 1 }],
  ['timeline_tour', '时间旅人', '沿时间线追溯历史', '展开一个时间线专题', '⏳', 'explore', true, { type: 'stats_array_len_gte', field: 'timeline_tours', value: 1 }, { type: 'ratio', field: 'stats.timeline_tours.length', max: 1 }],
  ['topic_3', '主题采撷', '按主题发现经文', '浏览 3 个不同主题页', '🌿', 'explore', true, { type: 'stats_array_len_gte', field: 'topic_ids', value: 3 }, { type: 'ratio', field: 'stats.topic_ids.length', max: 3 }],
  ['short_book_complete', '整卷速读', '一口气读完短篇书卷', '读完 1 卷 10 章以内的书', '⚡', 'explore', true, { type: 'custom', name: 'short_book_complete' }, { type: 'custom', name: 'short_book_complete' }],
  ['psalm_day_15', '诗篇一日', '一日诗篇漫游', '同一天读 15 篇不同诗篇', '🎵', 'explore', true, { type: 'custom', name: 'psalm_day', args: { min: 15 } }, { type: 'custom', name: 'psalm_day', args: { min: 15 } }],
  ['four_gospels', '四福音巡游', '四福音各读一章', '马太、马可、路加、约翰各读 1 章', '🕊', 'explore', true, { type: 'custom', name: 'gospels_started', args: { min: 4 } }, { type: 'custom', name: 'gospels_started', args: { min: 4 } }],
  ['xiaoai_first', '初次请教', '向小爱提出第一个问题', '向小爱提问 1 次', '✦', 'xiaoai', true, { type: 'stats_gte', field: 'xiaoai_questions', value: 1 }, { type: 'ratio', field: 'stats.xiaoai_questions', max: 1 }],
  ['citation_first', '脚注学者', '顺藤摸瓜读出处', '点击脚注引用 1 次', '📎', 'xiaoai', true, { type: 'stats_gte', field: 'citation_clicks', value: 1 }, { type: 'ratio', field: 'stats.citation_clicks', max: 1 }],
  ['save_answer_note', '存笔记达人', '把亮光存下来', '从小爱回答存笔记 1 次', '📝', 'xiaoai', true, { type: 'stats_gte', field: 'save_answer_notes', value: 1 }, { type: 'ratio', field: 'stats.save_answer_notes', max: 1 }],
  ['followup_3', '追问三连', '刨根问底', '同一会话连续追问 3 次', '💬', 'xiaoai', true, { type: 'stats_gte', field: 'max_followups_session', value: 3 }, { type: 'ratio', field: 'stats.max_followups_session', max: 3 }],
  ['half_sheet', '半屏知己', '阅读中随时请教', '使用半屏小爱 1 次', '📱', 'xiaoai', true, { type: 'stats_gte', field: 'half_sheet_xiaoai', value: 1 }, { type: 'ratio', field: 'stats.half_sheet_xiaoai', max: 1 }],
  ['life_apply', '生活应用派', '把真理带入生活', '使用「生活应用」场景提问', '🌱', 'xiaoai', true, { type: 'stats_includes', field: 'scenes_used', value: 'chat_apply' }, { type: 'bool' }],
  ['triple_scene', '同一节三重奏', '多角度认识一节经文', '对同一节经文用 3 种场景提问', '🎼', 'xiaoai', true, { type: 'custom', name: 'triple_scene', args: { min: 3 } }, { type: 'custom', name: 'triple_scene', args: { min: 3 } }],
  ['share_answer', '分享亮光', '把好答案分享出去', '分享小爱回答 1 次', '📤', 'xiaoai', true, { type: 'stats_gte', field: 'share_answers', value: 1 }, { type: 'ratio', field: 'stats.share_answers', max: 1 }],
  ['note_first', '首笔心得', '记录第一段感动', '写 1 条笔记', '✎', 'devotional', false, { type: 'ctx_gte', field: 'noteCount', value: 1 }, { type: 'ratio', field: 'noteCount', max: 1 }],
  ['note_deep', '深度反思', '沉潜思考', '单条笔记不少于 100 字', '📓', 'devotional', true, { type: 'ctx_gte', field: 'maxNoteLen', value: 100 }, { type: 'ratio', field: 'maxNoteLen', max: 100 }],
  ['highlight_3', '彩色经文', '用颜色标记重点', '使用 3 种不同划线颜色', '🖍', 'devotional', true, { type: 'ctx_gte', field: 'highlightColors', value: 3 }, { type: 'ratio', field: 'highlightColors', max: 3 }],
  ['bookmark_10', '书签收藏家', '珍藏重要经节', '收藏 10 节经文', '🔖', 'devotional', true, { type: 'ctx_gte', field: 'bookmarkCount', value: 10 }, { type: 'ratio', field: 'bookmarkCount', max: 10 }],
  ['thought_first', '想法发布者', '分享读经想法', '发布 1 条读经想法', '💭', 'devotional', true, { type: 'ctx_gte', field: 'thoughtCount', value: 1 }, { type: 'ratio', field: 'thoughtCount', max: 1 }],
  ['memory_review', '复习卡片', '温故知新', '从收藏复习进入阅读 1 次', '🃏', 'devotional', true, { type: 'stats_gte', field: 'memory_reviews', value: 1 }, { type: 'ratio', field: 'stats.memory_reviews', max: 1 }],
  ['checkin_first', '第一次打卡', '在群体中见证', '在共读群打卡 1 次', '📍', 'social', true, { type: 'stats_gte', field: 'group_checkins', value: 1 }, { type: 'ratio', field: 'stats.group_checkins', max: 1 }],
  ['checkin_streak_7', '守群人', '与群友彼此守望', '同一群连续打卡 7 天', '🛡', 'social', true, { type: 'custom', name: 'group_checkin_streak', args: { min: 7 } }, { type: 'custom', name: 'group_checkin_streak', args: { min: 7 } }],
  ['respond_first', '回应同伴', '彼此鼓励', '回应群友打卡 1 次', '🤝', 'social', true, { type: 'stats_gte', field: 'group_responses', value: 1 }, { type: 'ratio', field: 'stats.group_responses', max: 1 }],
  ['group_create', '群主初任', '发起共读', '创建 1 个共读群', '👥', 'social', true, { type: 'stats_gte', field: 'groups_created', value: 1 }, { type: 'ratio', field: 'stats.groups_created', max: 1 }],
  ['plan_share', '计划同行', '与群一起读计划', '将读经计划分享到群', '📅', 'social', true, { type: 'stats_bool', field: 'plan_shared_group' }, { type: 'bool' }],
  ['invite_accept', '邀请使者', '应邀加入群体', '接受 1 次群邀请', '✉', 'social', true, { type: 'stats_gte', field: 'invites_accepted', value: 1 }, { type: 'ratio', field: 'stats.invites_accepted', max: 1 }],
  ['jas_short', '最短的一节', '遇见雅 4:15', '阅读雅 4:15', '📏', 'easter_egg', true, { type: 'custom', name: 'has_verse_ref', args: { ref: 'JAS.4.15' } }, { type: 'bool' }],
  ['ps119', '最长的一章', '读完诗 119 篇', '阅读诗 119 篇', '📜', 'easter_egg', true, { type: 'custom', name: 'has_chapter', args: { book: 'PSA', chapter: 119 } }, { type: 'bool' }],
  ['twelve_apostles', '十二使徒', '读太 10 章', '阅读太 10 章', '🐟', 'easter_egg', true, { type: 'custom', name: 'has_chapter', args: { book: 'MAT', chapter: 10 } }, { type: 'bool' }],
  ['prodigal', '浪子回家', '读路 15 章', '阅读路 15 章', '🏠', 'easter_egg', true, { type: 'custom', name: 'has_chapter', args: { book: 'LUK', chapter: 15 } }, { type: 'bool' }],
  ['night_xiaoai', 'Still Small Voice', '深夜向小爱倾诉', '23:00–5:00 向小爱提问', '🌙', 'easter_egg', true, { type: 'stats_bool', field: 'night_xiaoai' }, { type: 'bool' }],
  ['wrong_revive', '错题复活', '把错题重新答对', '累计复活 5 道错题', '🔄', 'easter_egg', true, { type: 'stats_gte', field: 'wrong_revived', value: 5 }, { type: 'ratio', field: 'stats.wrong_revived', max: 5 }],
];

const badges = rows.map(([id, label, desc, hint, icon, category, interesting, rule, progress]) => ({
  id,
  label,
  desc,
  hint,
  icon,
  category,
  interesting,
  rule,
  progress,
}));

const out = {
  version: 1,
  categories,
  categoryOrder,
  badges,
};

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jsonPath = join(root, 'shared/badges.json');
writeFileSync(jsonPath, `${JSON.stringify(out, null, 2)}\n`);
writeFileSync(join(root, 'apps/mobile/assets/badges.json'), `${JSON.stringify(out, null, 2)}\n`);
console.log(`Wrote ${badges.length} badges to shared/badges.json and apps/mobile/assets/badges.json`);
