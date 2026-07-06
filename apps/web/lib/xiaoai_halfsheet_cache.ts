/** 读经半屏小爱：同 ref + 选区 + 问句 缓存 LLM 回答（本地，按自然日刷新）。 */

import type { Citation } from './api';
import type { AssistantScene } from './assistant_scenes';
import { chinaTodayYmd } from './daily_clock';

const STORAGE_KEY = 'presto_xiaoai_halfsheet_v1';
const MAX_ENTRIES = 48;

type CacheEntry = {
  answer: string;
  citations: Citation[];
  day: string;
  savedAt: number;
};

type CacheMap = Record<string, CacheEntry>;

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
    const raw = localStorage.getItem(STORAGE_KEY);
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
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
