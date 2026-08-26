/** 读经半屏小爱：同 ref + 选区 + 问句 缓存 LLM 回答（本地，按自然日刷新）。 */

import type { Citation } from './api';
import type { AssistantScene } from './assistant_scenes';
import { chinaTodayYmd } from './daily_clock';
import { userLsGet, userLsSet } from './user_storage';

const STORAGE_KEY = 'presto_xiaoai_halfsheet_v1';
const MAX_ENTRIES = 48;

const VERSE_FULL_SECTIONS = ['摘要', '背景', '经文解释'] as const;
const VERSE_QUICK_SECTIONS = ['摘要', '经文解释'] as const;

type CacheEntry = {
  answer: string;
  citations: Citation[];
  day: string;
  savedAt: number;
};

type CacheMap = Record<string, CacheEntry>;

function sectionTitles(text: string): Set<string> {
  const titles = new Set<string>();
  for (const m of text.matchAll(/^###\s+(.+)$/gm)) {
    const t = m[1]?.trim();
    if (t && t !== '相关追问') titles.add(t);
  }
  for (const m of text.matchAll(/【([^】]+)】/g)) {
    const t = m[1]?.trim();
    if (t && t !== '相关追问') titles.add(t);
  }
  return titles;
}

/** 半屏解读回答是否结构完整，避免缓存/展示半截生成。 */
export function isHalfSheetAnswerComplete(answer: string, scene: AssistantScene): boolean {
  const text = answer.trim();
  if (!text || text.startsWith('⚠️')) return false;

  const required =
    scene === 'verse_full'
      ? VERSE_FULL_SECTIONS
      : scene === 'verse_quick'
        ? VERSE_QUICK_SECTIONS
        : null;
  const minLen = scene === 'verse_full' ? 100 : scene === 'verse_quick' ? 60 : 80;

  if (text.length < minLen) return false;
  if (!required) return true;

  const titles = sectionTitles(text);
  return required.every((s) => titles.has(s));
}

/** FAB 无选区时选区不参与 cache key / 问句，仅 ref + scene。 */
export function halfSheetCacheSelection(selection: string, explicitSelection: boolean): string {
  if (!explicitSelection) return '';
  return selection.trim();
}

/** 半屏 API 问句：长选区不拼进 prompt，经文由 ref 在后端展开。 */
export function buildHalfSheetQuestion(
  userQuestion: string,
  selection: string,
  explicitSelection: boolean,
): string {
  const sel = halfSheetCacheSelection(selection, explicitSelection);
  return sel && sel.length <= 300 ? `${userQuestion}\n\n选中文本：${sel}` : userQuestion;
}

function buildKey(
  scene: AssistantScene,
  ref: string,
  selection: string,
  question: string,
): string {
  return [scene, ref.trim().toUpperCase(), selection.trim(), question.trim()].join('\x1e');
}

function readMap(): CacheMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = userLsGet(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(map: CacheMap) {
  if (typeof window === 'undefined') return;
  const entries = Object.entries(map).sort((a, b) => b[1].savedAt - a[1].savedAt);
  const trimmed = Object.fromEntries(entries.slice(0, MAX_ENTRIES));
  userLsSet(STORAGE_KEY, JSON.stringify(trimmed));
}

export function readHalfSheetCache(
  scene: AssistantScene,
  ref: string,
  selection: string,
  question: string,
): { answer: string; citations: Citation[] } | null {
  const key = buildKey(scene, ref, selection, question);
  const entry = readMap()[key];
  if (!entry?.answer?.trim()) return null;
  const today = chinaTodayYmd();
  if (entry.day !== today) return null;
  if (!isHalfSheetAnswerComplete(entry.answer, scene)) {
    const map = readMap();
    delete map[key];
    writeMap(map);
    return null;
  }
  return { answer: entry.answer, citations: entry.citations ?? [] };
}

export function writeHalfSheetCache(
  scene: AssistantScene,
  ref: string,
  selection: string,
  question: string,
  answer: string,
  citations: Citation[],
) {
  const text = answer.trim();
  if (!text || text.startsWith('⚠️')) return;
  if (!isHalfSheetAnswerComplete(text, scene)) return;
  const key = buildKey(scene, ref, selection, question);
  const map = readMap();
  map[key] = {
    answer: text,
    citations,
    day: chinaTodayYmd(),
    savedAt: Date.now(),
  };
  writeMap(map);
}
