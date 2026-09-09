import { bodyText } from '@/lib/assistant_format';
import type { StreamSection } from '@/lib/assistant_section_stream';

export const MIN_SECTION_BODY_CHARS = 20;

/** 流式是否已有可见正文（有内容即隐藏思考行）。 */
export function hasVisibleAnswerContent(text: string, minChars = 8): boolean {
  const t = bodyText(text).trim();
  if (!t) return false;

  const sectionRe = /(?:^|\n)###\s+(.+?)\s*\n([\s\S]*?)(?=\n### |\z)/gm;
  for (const m of t.matchAll(sectionRe)) {
    const body = (m[2] ?? '').trim();
    if (body.length >= MIN_SECTION_BODY_CHARS) return true;
  }

  const withoutHeadings = t.replace(/(?:^|\n)###\s+.+\s*/gm, '').trim();
  if (withoutHeadings.length >= minChars) return true;
  return false;
}

export function hasVisibleStreamSections(sections?: StreamSection[] | null): boolean {
  if (!sections?.length) return false;
  return sections.some((s) => s.text.trim().length >= MIN_SECTION_BODY_CHARS);
}

export function hasVisibleAssistantAnswer(
  text: string,
  streamSections?: StreamSection[] | null,
): boolean {
  return hasVisibleAnswerContent(text) || hasVisibleStreamSections(streamSections);
}

export function currentWritingSectionTitle(
  sections?: StreamSection[] | null,
): string | undefined {
  if (!sections?.length) return undefined;
  const pending = sections.find((s) => !s.text.trim());
  if (pending) return pending.title;
  const last = sections[sections.length - 1];
  if (!last.finalized) return last.title;
  return undefined;
}

export function writtenSectionIdsFromStream(sections: StreamSection[]): Set<string> {
  return new Set(sections.filter((s) => s.text.trim()).map((s) => s.id));
}
