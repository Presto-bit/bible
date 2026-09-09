import { bodyText } from '@/lib/assistant_format';
import {
  parseAnswerSections,
  sectionSlug,
  type AnswerSection,
} from '@/lib/assistant_sections';

export type OutputPlan = {
  lead?: boolean;
  sections: string[];
  budget_chars?: number;
  max_followups?: number;
};

export function planToSections(plan?: OutputPlan): AnswerSection[] {
  if (!plan?.sections?.length) return [];
  return plan.sections.map((title) => ({
    id: sectionSlug(title),
    title,
  }));
}

/** output_plan → sections；已有解析结果优先。 */
export function mergePlannedSections(
  outputPlan: OutputPlan | undefined,
  fromDone: AnswerSection[] | undefined,
  text: string,
): AnswerSection[] {
  if (fromDone?.length) {
    return fromDone.map((s) => ({
      id: s.id?.trim() || sectionSlug(s.title),
      title: s.title,
    }));
  }
  const planned = planToSections(outputPlan);
  if (planned.length) return planned;
  return parseAnswerSections(bodyText(text));
}
