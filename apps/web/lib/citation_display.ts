import type { Citation } from './api';
import { bodyText } from './assistant_format';

const FOOTNOTE_NUM_RE = /\[(\d{1,2})\]|［(\d{1,2})］|【(\d{1,2})】|（(\d{1,2})）/g;

/** 从回答正文中提取实际出现的脚标序号（去重、按出现顺序） */
export function footnoteNumbersInText(text: string): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const m of bodyText(text).matchAll(FOOTNOTE_NUM_RE)) {
    const n = Number(m[1] ?? m[2] ?? m[3] ?? m[4]);
    if (!Number.isFinite(n) || n < 1 || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

/** 仅保留正文里实际引用到的参考资料 */
export function citationsUsedInText(text: string, citations: Citation[]): Citation[] {
  if (!citations.length) return [];
  const nums = new Set(footnoteNumbersInText(text));
  if (!nums.size) return [];
  return citations.filter((c) => nums.has(c.n));
}

/** 将 RAG 文档标题规范为中文展示名 */
export function formatCitationTitle(title: string | undefined, bookName?: string): string {
  const raw = (title || '').trim();
  const stripped = raw.replace(/^\d+-/, '').trim();
  const zhCore = stripped.replace(/[A-Za-z0-9_\-.]/g, '').trim();
  if (zhCore.length >= 2) {
    if (/背景|注释|释义|导论|概述/.test(stripped)) return stripped;
    return `${stripped} · 背景注释`;
  }
  if (bookName?.trim()) return `${bookName.trim()} · 背景注释`;
  return '圣经背景注释';
}

export function localizeCitations(
  citations: Citation[],
  bookName?: string,
): Citation[] {
  return citations.map((c) => ({
    ...c,
    title: formatCitationTitle(c.title, bookName),
  }));
}
