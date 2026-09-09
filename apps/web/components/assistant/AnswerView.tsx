'use client';

import AnswerProfileBody, {
  type ResponseProfile,
} from '@/components/assistant/AnswerProfileBody';

export type { ResponseProfile };

import type { StreamSection } from '@/lib/assistant_section_stream';

export type AnswerViewProps = {
  text: string;
  streaming?: boolean;
  dense?: boolean;
  responseProfile?: ResponseProfile;
  structureAssets?: import('@/lib/assistant_blocks').StructureAsset[];
  streamSections?: StreamSection[];
  onCitationClick?: (n: number) => void;
};

/** 半屏 / Tab 共用回答渲染入口。 */
export default function AnswerView(props: AnswerViewProps) {
  return <AnswerProfileBody {...props} />;
}
