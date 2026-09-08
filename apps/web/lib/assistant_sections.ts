import { bodyText } from '@/lib/assistant_format';

export type AnswerSection = { id: string; title: string };

const SECTION_MD_RE = /^###\s+(.+)$/gm;
const SECTION_LEGACY_RE = /【([^】]+)】/g;

/** 小节锚点 id（与 Markdown h3 id 一致）。 */
export function sectionSlug(title: string): string {
  const base = title.trim().replace(/\s+/g, '-');
  const safe = base.replace(/[^\w\u4e00-\u9fff-]/g, '');
  return safe ? `sec-${safe}` : 'sec-section';
}

/** 从正文反解析 ### / 【】 小节列表。 */
export function parseAnswerSections(text: string): AnswerSection[] {
  const sections: AnswerSection[] = [];
  for (const m of text.matchAll(SECTION_MD_RE)) {
    const title = m[1]?.trim() ?? '';
    if (!title || title === '相关追问') break;
    sections.push({ id: sectionSlug(title), title });
  }
  if (sections.length) return sections;
  for (const m of text.matchAll(SECTION_LEGACY_RE)) {
    const title = m[1]?.trim() ?? '';
    if (!title || title === '相关追问') break;
    sections.push({ id: sectionSlug(title), title });
  }
  return sections;
}

/** done.sections 优先，否则从正文解析。 */
export function mergeAnswerSections(
  fromDone: AnswerSection[] | undefined,
  text: string,
): AnswerSection[] {
  if (fromDone?.length) {
    return fromDone.map((s) => ({
      id: s.id?.trim() || sectionSlug(s.title),
      title: s.title,
    }));
  }
  return parseAnswerSections(bodyText(text));
}

export const LEAD_SECTION_TITLES = new Set(['摘要', '本章概览', '卷概览']);
