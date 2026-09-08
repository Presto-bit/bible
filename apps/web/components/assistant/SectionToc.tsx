'use client';

import type { AnswerSection } from '@/lib/assistant_sections';

type Props = {
  sections: AnswerSection[];
  activeId?: string;
  writtenSectionIds?: Set<string>;
  streaming?: boolean;
  onSelect: (id: string) => void;
};

export default function SectionToc({
  sections,
  activeId,
  writtenSectionIds,
  streaming = false,
  onSelect,
}: Props) {
  if (sections.length < 2) return null;
  return (
    <nav className="section-toc" aria-label="小节导航">
      {sections.map((s) => {
        const written = !streaming || writtenSectionIds?.has(s.id);
        return (
          <button
            key={s.id}
            type="button"
            className={[
              'section-toc-chip',
              activeId === s.id ? 'is-active' : '',
              streaming && !written ? 'is-pending' : '',
              streaming && written ? 'is-written' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => onSelect(s.id)}
          >
            {s.title}
            {streaming && !written ? '…' : ''}
          </button>
        );
      })}
    </nav>
  );
}
