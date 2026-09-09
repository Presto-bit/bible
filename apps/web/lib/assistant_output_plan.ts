import { bodyText } from '@/lib/assistant_format';
import {
  parseAnswerSections,
  sectionSlug,
  type AnswerSection,
} from '@/lib/assistant_sections';

export type OutputPlan = {
  depth?: string;
  section_policy?: 'lead_only' | 'soft' | 'full';
  prefer_prose?: boolean;
  lead?: boolean;
  sections: string[];
  budget_chars?: number;
  soft_max_chars?: number;
  min_complete?: number;
  max_followups?: number;
};

/** 流式阶段是否展示小节骨架（flash/lead_only 仅一节也显示）。 */
export function shouldShowOutputPlanSkeleton(plan?: OutputPlan): boolean {
  const n = plan?.sections?.length ?? 0;
  if (n === 0) return false;
  if (plan?.section_policy === 'lead_only') return n >= 1;
  return n >= 2;
}

/** section_stream 预种子：lead_only 只挂摘要，soft 最多两节，full 全挂。 */
export function streamSeedTitles(plan?: OutputPlan): string[] {
  if (!plan?.sections?.length) return [];
  switch (plan.section_policy) {
    case 'lead_only':
      return plan.sections.slice(0, 1);
    case 'soft':
      return plan.sections.slice(0, 2);
    default:
      return plan.sections;
  }
}

export function planToSections(plan?: OutputPlan): AnswerSection[] {
  if (!plan?.sections?.length) return [];
  return plan.sections.map((title) => ({
    id: sectionSlug(title),
    title,
  }));
}

export function skeletonSectionsFromPlan(plan?: OutputPlan): AnswerSection[] {
  const titles = streamSeedTitles(plan);
  return titles.map((title) => ({ id: sectionSlug(title), title }));
}

/** 流式 TOC：lead_only/soft 须两节已有正文才展示，避免四节空导航。 */
export function shouldShowSectionToc(
  sections: AnswerSection[],
  outputPlan: OutputPlan | undefined,
  streaming: boolean,
  writtenSectionIds: Set<string>,
): boolean {
  if (sections.length < 2) return false;
  if (!streaming) return true;
  const policy = outputPlan?.section_policy ?? 'full';
  if (policy === 'lead_only' || policy === 'soft') {
    return writtenSectionIds.size >= 2;
  }
  return sections.length >= 2;
}

/** output_plan → sections；已有解析结果优先。 */
export function mergePlannedSections(
  outputPlan: OutputPlan | undefined,
  fromDone: AnswerSection[] | undefined,
  text: string,
  options?: { streaming?: boolean },
): AnswerSection[] {
  if (fromDone?.length) {
    return fromDone.map((s) => ({
      id: s.id?.trim() || sectionSlug(s.title),
      title: s.title,
    }));
  }
  if (options?.streaming && outputPlan?.sections?.length) {
    const parsed = parseAnswerSections(bodyText(text));
    if (parsed.length) return parsed;
    return skeletonSectionsFromPlan(outputPlan);
  }
  const planned = planToSections(outputPlan);
  if (planned.length) return planned;
  return parseAnswerSections(bodyText(text));
}
