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

/** done 事件：优先 document，智能 merge 流式正文，避免整段跳变。 */
export function resolveDoneAnswer(
  streamedText: string,
  payload?: ChatDonePayload,
  sectionStream?: SectionStreamAccumulator | null,
): ResolvedDoneAnswer {
  const streamBuilt = sectionStream?.active ? sectionStream.toMarkdown().trim() : '';
  const streamed = streamedText.trim();
  const effectiveStream = streamBuilt || streamed;
  const base = resolveDoneAnswerCore(effectiveStream, payload);
  const bestText = preferLongerText(streamBuilt, base.text, streamed);

  const streamSections = sectionStream?.getSections() ?? [];
  const useStreamSections =
    Boolean(streamBuilt)
    && streamBuilt.length >= base.text.trim().length
    && streamSections.length > 0;

  return {
    ...base,
    text: bestText || base.text,
    sections: useStreamSections ? streamSections : base.sections,
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
