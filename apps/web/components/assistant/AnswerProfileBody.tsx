'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import AnswerExpandable from '@/components/AnswerExpandable';
import AnswerText from '@/components/AnswerText';
import SectionToc from '@/components/assistant/SectionToc';
import StructureAssetCard from '@/components/assistant/StructureAssetCard';
import TimelineRail from '@/components/assistant/TimelineRail';
import { bodyText } from '@/lib/assistant_format';
import { extractSummaryLead } from '@/lib/assistant_markdown';
import { mergeAnswerSections, type AnswerSection } from '@/lib/assistant_sections';
import {
  extractStudySheetCopyText,
  parseTimelineNodes,
  streamingWrittenSections,
  type StructureAsset,
} from '@/lib/assistant_blocks';

export type ResponseProfile =
  | 'side_compare'
  | 'viewpoint_stack'
  | 'apply_steps'
  | 'bullet_rail'
  | 'chapter_outline'
  | 'study_sheet'
  | 'lead_sections'
  | 'timeline_rail'
  | 'structure_map'
  | string;

type Props = {
  text: string;
  streaming?: boolean;
  dense?: boolean;
  responseProfile?: ResponseProfile;
  sections?: AnswerSection[];
  structureAssets?: StructureAsset[];
  defaultCollapsed?: boolean;
  collapseMinBodyLen?: number;
  expandLabel?: string;
  onCitationClick?: (n: number) => void;
  streamSummaryFirst?: boolean;
};

export default function AnswerProfileBody({
  text,
  streaming = false,
  dense = false,
  responseProfile,
  sections,
  structureAssets,
  defaultCollapsed = false,
  collapseMinBodyLen = 80,
  expandLabel = '展开全文',
  onCitationClick,
  streamSummaryFirst = true,
}: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [activeSection, setActiveSection] = useState<string | undefined>();
  const [copiedStudy, setCopiedStudy] = useState(false);

  const clean = useMemo(() => bodyText(text), [text]);
  const mergedSections = useMemo(
    () => mergeAnswerSections(sections, clean),
    [sections, clean],
  );
  const writtenSectionIds = useMemo(
    () => (streaming ? streamingWrittenSections(clean, mergedSections) : undefined),
    [streaming, clean, mergedSections],
  );
  const timelineNodes = useMemo(() => parseTimelineNodes(clean), [clean]);
  const profileClass = responseProfile ? `answer-profile-${responseProfile}` : '';
  const showPresetStructure =
    !streaming
    && Boolean(structureAssets?.length)
    && (responseProfile === 'structure_map' || responseProfile === 'timeline_rail');
  const showParsedTimeline =
    timelineNodes.length >= 2
    && (responseProfile === 'timeline_rail' || mergedSections.some((s) => s.title === '时间线'));
  const studyCopyText = useMemo(
    () => (responseProfile === 'study_sheet' ? extractStudySheetCopyText(clean) : ''),
    [responseProfile, clean],
  );

  const handleSectionSelect = useCallback((id: string) => {
    setActiveSection(id);
    const root = bodyRef.current;
    const el = root?.querySelector(`#${CSS.escape(id)}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const handleCopyStudy = useCallback(async () => {
    if (!studyCopyText) return;
    try {
      await navigator.clipboard.writeText(studyCopyText);
      setCopiedStudy(true);
      window.setTimeout(() => setCopiedStudy(false), 1600);
    } catch {
      /* ignore */
    }
  }, [studyCopyText]);

  const { summary, body: bodyWithoutSummary } = useMemo(
    () => extractSummaryLead(clean),
    [clean],
  );
  const showStreamLead = Boolean(
    streaming && streamSummaryFirst && summary && summary.trim(),
  );

  if (showStreamLead) {
    const tail = bodyWithoutSummary.trim() ? bodyWithoutSummary : clean;
    return (
      <div ref={bodyRef} className={`answer-profile-body ${profileClass}`.trim()}>
        <p className="xiaoai-summary-lead">{summary}</p>
        {tail.trim() ? (
          <AnswerText
            text={tail}
            streaming
            dense={dense}
            onCitationClick={onCitationClick}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div ref={bodyRef} className={`answer-profile-body ${profileClass}`.trim()}>
      {showPresetStructure && structureAssets?.[0] ? (
        <StructureAssetCard asset={structureAssets[0]} />
      ) : null}
      {mergedSections.length >= 2 ? (
        <SectionToc
          sections={mergedSections}
          activeId={activeSection}
          writtenSectionIds={writtenSectionIds}
          streaming={streaming}
          onSelect={handleSectionSelect}
        />
      ) : null}
      {showParsedTimeline ? <TimelineRail nodes={timelineNodes} /> : null}
      {studyCopyText ? (
        <div className="study-sheet-copy-row">
          <button type="button" className="text-link study-sheet-copy-btn" onClick={handleCopyStudy}>
            {copiedStudy ? '已复制讨论题' : '复制讨论题'}
          </button>
        </div>
      ) : null}
      <AnswerExpandable
        text={text}
        streaming={streaming}
        dense={dense}
        defaultCollapsed={defaultCollapsed}
        collapseMinBodyLen={collapseMinBodyLen}
        expandLabel={expandLabel}
        onCitationClick={onCitationClick}
      />
    </div>
  );
}
