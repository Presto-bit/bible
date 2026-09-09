'use client';

import { useMemo, useState } from 'react';
import AnswerText from '@/components/AnswerText';
import AnswerSectionSkeleton from '@/components/assistant/AnswerSectionSkeleton';
import StructureAssetCard from '@/components/assistant/StructureAssetCard';
import TimelineRail from '@/components/assistant/TimelineRail';
import { bodyText } from '@/lib/assistant_format';
import {
  extractStudySheetCopyText,
  parseTimelineNodes,
  type StructureAsset,
} from '@/lib/assistant_blocks';
import type { StreamSection } from '@/lib/assistant_section_stream';
import {
  hasVisibleAssistantAnswer,
  writtenSectionIdsFromStream,
} from '@/lib/assistant_visible';

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
  structureAssets?: StructureAsset[];
  streamSections?: StreamSection[];
  onCitationClick?: (n: number) => void;
};

/** 半屏 / Tab 回答渲染：流式 skeleton + 完成 Markdown。 */
export default function AnswerProfileBody({
  text,
  streaming = false,
  dense = false,
  responseProfile,
  structureAssets,
  streamSections,
  onCitationClick,
}: Props) {
  const [copiedStudy, setCopiedStudy] = useState(false);

  const clean = useMemo(() => bodyText(text), [text]);
  const writtenSections = useMemo(
    () => streamSections?.filter((s) => s.text.trim()) ?? [],
    [streamSections],
  );
  const hasWritten = hasVisibleAssistantAnswer(text, streaming ? streamSections : null);
  const showSkeleton = Boolean(
    streaming && streamSections?.some((s) => !s.text.trim()),
  );

  const timelineNodes = useMemo(() => parseTimelineNodes(clean), [clean]);
  const profileClass = responseProfile ? `answer-profile-${responseProfile}` : '';
  const showPresetStructure =
    !streaming
    && Boolean(structureAssets?.length)
    && (responseProfile === 'structure_map' || responseProfile === 'timeline_rail');
  const showParsedTimeline =
    timelineNodes.length >= 2
    && (responseProfile === 'timeline_rail'
      || /###\s*时间线/m.test(clean));
  const studyCopyText = useMemo(
    () => (responseProfile === 'study_sheet' ? extractStudySheetCopyText(clean) : ''),
    [responseProfile, clean],
  );

  const handleCopyStudy = async () => {
    if (!studyCopyText) return;
    try {
      await navigator.clipboard.writeText(studyCopyText);
      setCopiedStudy(true);
      window.setTimeout(() => setCopiedStudy(false), 1600);
    } catch {
      /* ignore */
    }
  };

  if (!hasWritten && !showSkeleton) return null;

  return (
    <div className={`answer-profile-body ${profileClass}`.trim()}>
      {showPresetStructure && structureAssets?.[0] ? (
        <StructureAssetCard asset={structureAssets[0]} />
      ) : null}
      {showParsedTimeline ? <TimelineRail nodes={timelineNodes} /> : null}
      {studyCopyText ? (
        <div className="study-sheet-copy-row">
          <button type="button" className="text-link study-sheet-copy-btn" onClick={handleCopyStudy}>
            {copiedStudy ? '已复制讨论题' : '复制讨论题'}
          </button>
        </div>
      ) : null}
      {hasWritten ? (
        <AnswerText
          text={text}
          streaming={streaming}
          dense={dense}
          streamSections={
            streaming && writtenSections.length
              ? writtenSections
              : streamSections
          }
          onCitationClick={onCitationClick}
        />
      ) : null}
      {showSkeleton && streamSections ? (
        <AnswerSectionSkeleton
          sections={streamSections.map((s) => ({ id: s.id, title: s.title }))}
          writtenSectionIds={writtenSectionIdsFromStream(streamSections)}
        />
      ) : null}
    </div>
  );
}
