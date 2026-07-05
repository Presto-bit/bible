import type { Citation } from './api';

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
