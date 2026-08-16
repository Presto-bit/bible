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
          <span
            key={i}
            role="button"
            tabIndex={0}
            className="inline-ref-link"
            onClick={(e) => {
              e.stopPropagation();
              onRefClick(p.osis!, p.value);
            }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' && e.key !== ' ') return;
              e.preventDefault();
              e.stopPropagation();
              onRefClick(p.osis!, p.value);
            }}
          >
            {p.value}
          </span>
        );
      })}
    </div>
  );
}
