/** 阅读器视口：中心经节与排版段 */

import type { VerseParagraph } from './paragraphs';

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
