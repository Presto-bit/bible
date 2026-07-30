'use client';

import { useEffect, useMemo, useState } from 'react';
import { captureAcquisitionFromLocation } from '@/lib/acquisition';
import { navigateToAssistant, storeAssistantPrefill } from '@/lib/assistant_prefill';
import { readerHrefFromRef } from '@/lib/group_footprint';
import type { Citation } from '@/lib/api';
import AnswerText from '@/components/AnswerText';
import { CitationEvidenceRail } from '@/components/assistant/CitationEvidenceRail';
import { CitationBar } from '@/components/CitationBar';
import { ShareLandingCtas } from '@/components/ShareLandingCtas';
import { BRAND_NAME } from '@/lib/brand';

export function AnalysisShareClient({
  refLabel,
  refParam,
  more,
  answerMarkdown,
  citations = [],
  snapshotId,
  compactPreview,
}: {
  refLabel: string;
  refParam: string;
  more?: string;
  answerMarkdown?: string;
  citations?: Citation[];
  snapshotId?: string;
  /** query 截断链：精简预览 */
  compactPreview?: boolean;
}) {
  const [expanded, setExpanded] = useState(Boolean(answerMarkdown));
  const [citationOpen, setCitationOpen] = useState<number | null>(null);

  useEffect(() => {
    captureAcquisitionFromLocation();
  }, []);

  const fullAnswer = (answerMarkdown || '').trim();
  const hasFull = Boolean(fullAnswer);
  const hasMore = Boolean(more?.trim()) && !hasFull;

  const continueAsk = () => {
    const question = hasFull
      ? `基于你对「${refLabel}」的解读继续深入：请补充背景与今日应用。`
      : `请继续解读：${refLabel}`;
    if (hasFull) {
      const sid = storeAssistantPrefill({
        ref: refParam || '',
        question,
        scene: 'verse_full',
        surface: 'share_analysis',
        seedMessages: [
          {
            role: 'assistant',
            text: fullAnswer,
            citations: citations.length ? citations : undefined,
            scene: 'verse_full',
            sceneLabel: '分享解读',
          },
        ],
      });
      window.location.href = `/assistant?${new URLSearchParams({
        ...(refParam ? { ref: refParam } : {}),
        sid,
        scene: 'verse_full',
      }).toString()}`;
      return;
    }
    navigateToAssistant(refParam || undefined, {
      question,
      scene: 'verse_full',
      surface: 'share_analysis',
    });
  };

  const readHref = refParam
    ? readerHrefFromRef(refParam) || '/reader'
    : '/reader';

  const bookName = useMemo(
    () => refLabel.replace(/\s*\d+.*$/, '').trim(),
    [refLabel],
  );

  return (
    <>
      {compactPreview ? (
        <p className="muted analysis-share-compact-hint" role="status">
          精简预览 · 完整解读需分享者重新分享
        </p>
      ) : null}

      {hasFull ? (
        <div className="analysis-share-answer card card-2">
          <AnswerText text={fullAnswer} />
          {citations.length > 0 ? (
            <>
              <CitationEvidenceRail
                citations={citations}
                bookName={bookName}
                onOpen={setCitationOpen}
              />
              <div className="xiaoai-cite-host">
                <CitationBar
                  variant="action"
                  className="xiaoai-cite-host-trigger"
                  citations={citations}
                  activeN={citationOpen}
                  onActiveChange={setCitationOpen}
                  bookName={bookName}
                />
              </div>
            </>
          ) : null}
        </div>
      ) : hasMore ? (
        <div className="analysis-share-more-block">
          {expanded ? (
            <p className="analysis-share-more">{more}</p>
          ) : null}
          <button
            type="button"
            className="text-link analysis-share-expand"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? '收起' : '展开更多'}
          </button>
        </div>
      ) : null}

      <ShareLandingCtas
        preferContentPrimary
        contentPrimary={{ label: '在小爱继续解读', onClick: continueAsk }}
        installLabel="保存到主屏幕"
        secondary={[
          { href: readHref, label: '我也在读这一段' },
          { href: '/', label: `打开${BRAND_NAME}` },
        ]}
      />
      {snapshotId ? (
        <p className="muted analysis-share-snap-meta">分享编号 {snapshotId}</p>
      ) : null}
    </>
  );
}
