'use client';

import { splitInlineRefs } from '@/lib/inline_ref';

export function SectionTitle({
  title,
  onRefClick,
}: {
  title: string;
  onRefClick: (osis: string, label: string) => void;
}) {
  const parts = splitInlineRefs(title);
  return (
    <div className="section-title">
      {parts.map((p, i) => {
        if (p.kind === 'text') return <span key={i}>{p.value}</span>;
        if (!p.osis) return <span key={i}>{p.value}</span>;
        return (
          <button
            key={i}
            type="button"
            className="inline-ref-link"
            onClick={(e) => {
              e.stopPropagation();
              onRefClick(p.osis!, p.value);
            }}
          >
            {p.value}
          </button>
        );
      })}
    </div>
  );
}
