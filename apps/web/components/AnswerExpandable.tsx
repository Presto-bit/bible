'use client';

import { useMemo, useState } from 'react';
import AnswerText from '@/components/AnswerText';
import { bodyText } from '@/lib/assistant_format';
import { extractSummaryLead } from '@/lib/assistant_markdown';

type Props = {
  text: string;
  streaming?: boolean;
  dense?: boolean;
  /** 有摘要且正文足够长时，默认折叠深读 */
  defaultCollapsed?: boolean;
  collapseMinBodyLen?: number;
  expandLabel?: string;
  onCitationClick?: (n: number) => void;
};

export default function AnswerExpandable({
  text,
  streaming = false,
  dense = false,
  defaultCollapsed = false,
  collapseMinBodyLen = 80,
  expandLabel = '展开全文',
  onCitationClick,
}: Props) {
  const clean = useMemo(() => bodyText(text), [text]);
  const { summary, body: bodyWithoutSummary } = useMemo(
    () => extractSummaryLead(clean),
    [clean],
  );
  const canCollapse = useMemo(
    () =>
      !streaming
      && Boolean(summary)
      && bodyWithoutSummary.trim().length >= collapseMinBodyLen,
    [streaming, summary, bodyWithoutSummary, collapseMinBodyLen],
  );
  const [expanded, setExpanded] = useState(!defaultCollapsed || !canCollapse);

  if (!canCollapse || expanded) {
    return (
      <AnswerText
        text={clean || text}
        streaming={streaming}
        dense={dense}
        onCitationClick={onCitationClick}
      />
    );
  }

  return (
    <>
      <p className="xiaoai-summary-lead">{summary}</p>
      <button
        type="button"
        className="text-link xiaoai-expand-btn"
        onClick={() => setExpanded(true)}
      >
        {expandLabel}
      </button>
    </>
  );
}
