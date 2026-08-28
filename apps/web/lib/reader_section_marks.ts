import type { SectionMark } from './section_titles';

/** 某节是否为 pericope 小标题锚点 */
export function sectionMarkAt(
  outline: SectionMark[],
  verse: number,
): SectionMark | undefined {
  return outline.find((m) => m.verse === verse);
}
