'use client';

import type { Citation } from '@/lib/api';
import { formatCitationTitle } from '@/lib/citation_display';

type Props = {
  citations: Citation[];
  bookName?: string;
  onOpen?: (n: number) => void;
  className?: string;
};

/** 回答后横向可滑「参考来源」卡 */
export function CitationEvidenceRail({
  citations,
  bookName,
  onOpen,
  className,
}: Props) {
  if (!citations.length) return null;

  return (
    <div className={['citation-evidence-rail', className].filter(Boolean).join(' ')}>
      <p className="citation-evidence-rail-label">参考来源</p>
      <div className="citation-evidence-rail-track" role="list">
        {citations.map((c) => {
          const title = formatCitationTitle(c.title, bookName);
          const snip = (c.snippet || '').replace(/\s+/g, ' ').trim();
          return (
            <button
              key={c.n}
              type="button"
              role="listitem"
              className="citation-evidence-card"
              onClick={() => onOpen?.(c.n)}
            >
              <span className="citation-evidence-n">[{c.n}]</span>
              <span className="citation-evidence-title">{title}</span>
              {snip ? (
                <span className="citation-evidence-snip">
                  {snip.length > 48 ? `${snip.slice(0, 48)}…` : snip}
                </span>
              ) : null}
              <span className="citation-evidence-tag">注释</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
