/** 阅读器视口：中心经节与排版段 */

import type { VerseParagraph } from './paragraphs';

export interface SectionMarkLike {
  verse: number;
}

/** 小标题段落范围：从所在段首到下一小标题前（含末段至章末） */
export function sectionRangeForVerse(
  sections: SectionMarkLike[],
  centerVerse: number,
  maxVerse: number,
): { start: number; end: number } {
  const sorted = [...sections].sort((a, b) => a.verse - b.verse);
  let start = 1;
  for (const s of sorted) {
    if (s.verse <= centerVerse) start = s.verse;
    else break;
  }
  const next = sorted.find((s) => s.verse > start);
  const end = next && next.verse > centerVerse ? next.verse - 1 : maxVerse;
  return { start, end: Math.max(start, end) };
}

/** 视口垂直中心（35% 处）最近的经节号 */
export function centerVerseInScroll(
  scrollEl: HTMLElement,
  verseNums: number[],
): number | null {
  const mid = scrollEl.scrollTop + scrollEl.clientHeight * 0.35;
  let bestVerse: number | null = null;
  let bestDist = Infinity;
  for (const v of verseNums) {
    const anchor = document.getElementById(`verse-anchor-${v}`);
    if (!anchor) continue;
    const dist = Math.abs(anchor.offsetTop - mid);
    if (dist < bestDist) {
      bestDist = dist;
      bestVerse = v;
    }
  }
  return bestVerse;
}

/** 经节所在的排版段落（微读式连续段） */
export function paragraphForVerse(
  paragraphs: VerseParagraph[],
  verse: number,
): VerseParagraph | null {
  return (
    paragraphs.find((p) => verse >= p.startVerse && verse <= p.endVerse) ?? null
  );
}
