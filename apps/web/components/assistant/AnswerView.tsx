'use client';

import AnswerProfileBody, {
  type ResponseProfile,
} from '@/components/assistant/AnswerProfileBody';
import type { AnswerSection } from '@/lib/assistant_sections';
import type { StructureAsset } from '@/lib/assistant_blocks';
import type { OutputPlan } from '@/lib/assistant_output_plan';

export type { ResponseProfile };

export type AnswerViewProps = {
  text: string;
  streaming?: boolean;
  dense?: boolean;
  responseProfile?: ResponseProfile;
  sections?: AnswerSection[];
  outputPlan?: OutputPlan;
  structureAssets?: StructureAsset[];
  defaultCollapsed?: boolean;
  collapseMinBodyLen?: number;
  expandLabel?: string;
  onCitationClick?: (n: number) => void;
  streamSummaryFirst?: boolean;
};

/** 半屏 / Tab 共用回答渲染（P0：统一 AnswerProfileBody 入口）。 */
export default function AnswerView(props: AnswerViewProps) {
  return <AnswerProfileBody {...props} />;
}
