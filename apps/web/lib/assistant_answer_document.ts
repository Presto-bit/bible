import { bodyText } from '@/lib/assistant_format';
import type { AnswerBlock, TimelineNode } from '@/lib/assistant_blocks';
import {
  mergeAnswerSections,
  parseAnswerSections,
  type AnswerSection,
} from '@/lib/assistant_sections';
import type { ChatDonePayload } from '@/lib/api_core';
import type { SectionStreamAccumulator } from '@/lib/assistant_section_stream';

export type AnswerDocument = {
  schema_version?: number;
  markdown: string;
  sections: AnswerSection[];
  followups?: string[];
  lead?: string;
  blocks?: AnswerBlock[];
  timeline?: TimelineNode[];
  meta?: { incomplete?: boolean; scene?: string };
};

export type ResolvedDoneAnswer = {
  text: string;
  sections?: AnswerSection[];
  followups?: string[];
  lead?: string;
  blocks?: AnswerBlock[];
  incomplete?: boolean;
};

function preferLongerText(...candidates: string[]): string {
  return candidates.reduce((best, cur) => {
    const t = cur.trim();
    return t.length > best.length ? t : best;
  }, '');
}

export function sectionTitlesInMarkdown(text: string): string[] {
  const titles: string[] = [];
  for (const m of text.matchAll(/^###\s+(.+)$/gm)) {
    const title = m[1]?.trim();
    if (title && title !== '相关追问') titles.push(title);
  }
  return titles;
}

/** done 终稿：归一化 document 与流式正文取更完整者，避免终态只剩摘要。 */
export function pickStreamDoneText(opts: {
  documentText: string;
  streamBuilt?: string;
  streamed?: string;
  sectionPolicy?: string;
}): string {
  const doc = opts.documentText.trim();
  const stream = (opts.streamBuilt ?? '').trim() || (opts.streamed ?? '').trim();
  if (!doc) return stream;
  if (!stream) return doc;
  if (opts.sectionPolicy === 'lead_only') return doc;

  const docSections = sectionTitlesInMarkdown(doc).length;
  const streamSections = sectionTitlesInMarkdown(stream).length;
  if (streamSections > docSections) return stream;
  if (doc.length >= stream.length - 24) return doc;
  if (stream.length > doc.length + 40) return stream;
  return doc;
}

/** done 事件：优先 document，智能 merge 流式正文，避免整段跳变。 */
export function resolveDoneAnswer(
  streamedText: string,
  payload?: ChatDonePayload,
  sectionStream?: SectionStreamAccumulator | null,
  opts?: { sectionPolicy?: string },
): ResolvedDoneAnswer {
  const streamBuilt = sectionStream?.active ? sectionStream.toMarkdown().trim() : '';
  const streamed = streamedText.trim();
  const effectiveStream = streamBuilt || streamed;
  const base = resolveDoneAnswerCore(effectiveStream, payload);
  const hasDocument = Boolean(payload?.document?.markdown?.trim());
  const bestText = hasDocument
    ? pickStreamDoneText({
      documentText: base.text,
      streamBuilt,
      streamed,
      sectionPolicy: opts?.sectionPolicy,
    })
    : preferLongerText(streamBuilt, base.text, streamed);

  const streamSectionList = sectionStream?.getSections() ?? [];
  const useStreamSections =
    !hasDocument
    && Boolean(streamBuilt)
    && streamBuilt.length >= base.text.trim().length
    && streamSectionList.length > 0;

  return {
    ...base,
    text: bestText || base.text,
    sections: useStreamSections ? streamSectionList : base.sections,
  };
}

function resolveDoneAnswerCore(
  streamedText: string,
  payload?: ChatDonePayload,
): ResolvedDoneAnswer {
  const doc = payload?.document;
  if (doc?.markdown?.trim()) {
    const md = doc.markdown.trim();
    return {
      text: md,
      sections: mergeAnswerSections(
        doc.sections?.length ? doc.sections : payload?.sections,
        md,
      ),
      followups: doc.followups?.length ? doc.followups : payload?.followups,
      lead: doc.lead ?? payload?.lead,
      blocks: (doc.blocks as AnswerBlock[] | undefined) ?? (payload?.blocks as AnswerBlock[] | undefined),
      incomplete: doc.meta?.incomplete,
    };
  }

  const streamed = streamedText.trim();
  const streamedBody = streamed ? bodyText(streamed) : '';
  const doneRaw = payload?.text?.trim() ?? '';
  const doneBody = doneRaw ? bodyText(doneRaw) : '';

  let text = preferLongerText(streamedBody, doneBody);
  if (doneBody && streamedBody && doneBody.length > streamedBody.length + 8) {
    text = doneBody;
  }

  return {
    text,
    sections: mergeAnswerSections(payload?.sections, text),
    followups: payload?.followups,
    lead: payload?.lead,
    blocks: payload?.blocks as AnswerBlock[] | undefined,
  };
}
