'use client';

import type { AnswerSection } from '@/lib/assistant_sections';

type Props = {
  sections: AnswerSection[];
  writtenSectionIds: Set<string>;
};

/** 流式阶段：尚未写入正文的小节占位（P1 skeleton）。 */
export default function AnswerSectionSkeleton({ sections, writtenSectionIds }: Props) {
  const pending = sections.filter((s) => !writtenSectionIds.has(s.id));
  if (!pending.length) return null;
  return (
    <div className="answer-section-skeleton" aria-hidden>
      {pending.map((sec) => (
        <div key={sec.id} className="answer-section-skeleton-block">
          <span className="assistant-thinking-line" />
          <span className="assistant-thinking-line assistant-thinking-line-short" />
        </div>
      ))}
    </div>
  );
}
