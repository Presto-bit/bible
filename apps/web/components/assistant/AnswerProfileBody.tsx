'use client';

import { useMemo, useState } from 'react';
import AnswerText from '@/components/AnswerText';
import StructureAssetCard from '@/components/assistant/StructureAssetCard';
import TimelineRail from '@/components/assistant/TimelineRail';
import { bodyText } from '@/lib/assistant_format';
import {
  extractStudySheetCopyText,
  parseTimelineNodes,
  type StructureAsset,
} from '@/lib/assistant_blocks';

import type { StreamSection } from '@/lib/assistant_section_stream';

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

/** 半屏 / Tab 回答渲染：无 TOC、无骨架，流式与完成同一 Markdown 路径。 */
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

  if (!clean.trim()) return null;

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
      <AnswerText
        text={text}
        streaming={streaming}
        dense={dense}
        streamSections={streamSections}
        onCitationClick={onCitationClick}
      />
    </div>
  );
}
