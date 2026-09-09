/** 读经半屏小爱：同 ref + 选区 + 问句 缓存 LLM 回答（本地，按自然日刷新）。 */

import type { Citation } from './api';
import type { AssistantScene } from './assistant_scenes';
import { chinaTodayYmd } from './daily_clock';
import { userLsGet, userLsSet } from './user_storage';

const STORAGE_KEY = 'presto_xiaoai_halfsheet_v1';
const MAX_ENTRIES = 48;

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

/** 从 OSIS ref 末段解析选区节数（如 1CO.6.1-11 → 11）。 */
export function verseSpanFromRef(ref: string): number {
  const tail = ref.trim().split('.').pop() ?? '';
  const m = tail.match(/^(\d+)(?:-(\d+))?$/);
  if (!m) return 1;
  const start = parseInt(m[1]!, 10);
  const end = m[2] ? parseInt(m[2], 10) : start;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 1;
  return Math.max(1, end - start + 1);
}

function verseHasBackground(titles: Set<string>): boolean {
  return titles.has('经文背景') || titles.has('背景');
}

/** 半屏解读回答是否结构完整，避免缓存/展示半截生成（R1 depth 感知）。 */
export function isHalfSheetAnswerComplete(
  answer: string,
  scene: AssistantScene,
  verseSpan = 1,
  outputPlan?: import('./assistant_output_plan').OutputPlan,
): boolean {
  const text = answer.trim();
  if (!text || text.startsWith('⚠️')) return false;

  if (outputPlan?.sections?.length) {
    const minLen = outputPlan.min_complete ?? 60;
    if (text.length < minLen) return false;
    const titles = sectionTitles(text);
    for (const sec of outputPlan.sections) {
      if (sec === '经文背景' || sec === '背景') {
        if (!verseHasBackground(titles)) return false;
      } else if (!titles.has(sec)) {
        return false;
      }
    }
    return true;
  }

  const span = Math.max(1, verseSpan);
  const minLen =
    scene === 'verse_full'
      ? span <= 2
        ? 70
        : span <= 5
          ? 90 + Math.max(0, span - 2) * 15
          : Math.min(420, 140 + span * 8)
      : scene === 'verse_quick'
        ? span <= 2
          ? 45
          : span <= 5
            ? 55 + Math.max(0, span - 2) * 12
            : Math.min(360, 55 + span * 6)
        : 80;

  if (text.length < minLen) return false;
  if (scene !== 'verse_full' && scene !== 'verse_quick') return true;

  const titles = sectionTitles(text);
  if (scene === 'verse_quick') {
    return VERSE_QUICK_SECTIONS.every((s) => titles.has(s));
  }
  if (!titles.has('摘要') || !titles.has('经文解释')) return false;
  if (!verseHasBackground(titles)) return false;
  if (span >= 6 && !titles.has('段落脉络')) return false;
  return true;
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
  verseSpan = verseSpanFromRef(ref),
): { answer: string; citations: Citation[] } | null {
  const key = buildKey(scene, ref, selection, question);
  const entry = readMap()[key];
  if (!entry?.answer?.trim()) return null;
  const today = chinaTodayYmd();
  if (entry.day !== today) return null;
  if (!isHalfSheetAnswerComplete(entry.answer, scene, verseSpan)) {
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
  verseSpan = verseSpanFromRef(ref),
) {
  const text = answer.trim();
  if (!text || text.startsWith('⚠️')) return;
  if (!isHalfSheetAnswerComplete(text, scene, verseSpan)) return;
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

function refMatchesPrefix(ref: string, prefix: string): boolean {
  const r = ref.trim().toUpperCase();
  const p = prefix.trim().toUpperCase();
  if (!r || !p) return false;
  return r === p || r.startsWith(`${p}.`);
}

/** 按 ref 前缀清理半屏小爱 localStorage 缓存（如 JHN.13 整章）。 */
export function clearHalfSheetCacheForRefPrefix(refPrefix: string): number {
  const map = readMap();
  let removed = 0;
  for (const key of Object.keys(map)) {
    const ref = key.split('\x1e')[1] ?? '';
    if (refMatchesPrefix(ref, refPrefix)) {
      delete map[key];
      removed += 1;
    }
  }
  if (removed > 0) writeMap(map);
  return removed;
}
