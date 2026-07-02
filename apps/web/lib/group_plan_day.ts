import { api } from './api';
import { chapterRef } from './group_checkin';
import { groupPlanReaderHref } from './group_plan';
import { stepsForReadingRows, type ReadingDayRow } from './plan_steps';

export type GroupPlanDayInfo = {
  day: number;
  title: string;
  detail: string;
  readHref: string;
  primaryRef: string;
};

/** 群绑定计划的「今日/当前天」阅读摘要，用于今日焦点区。 */
export async function loadGroupPlanDayInfo(
  planId: string,
  day: number,
  groupId?: string,
): Promise<GroupPlanDayInfo | null> {
  if (!planId || day < 1) return null;
  try {
    const detail = await api.planDetail(planId);
    const rows = (detail.days ?? []) as ReadingDayRow[];
    const steps = stepsForReadingRows(rows, day);
    if (!steps.length) {
      return {
        day,
        title: `第 ${day} 天`,
        detail: detail.title || planId,
        readHref: groupPlanReaderHref(planId, day, groupId),
        primaryRef: '',
      };
    }
    const step = steps[0];
    const detailText = steps.map((s) => s.label).join(' · ');
    return {
      day,
      title: `第 ${day} 天`,
      detail: detailText,
      readHref: groupPlanReaderHref(planId, day, groupId),
      primaryRef: chapterRef(step.bookId, step.chapterStart),
    };
  } catch {
    return {
      day,
      title: `第 ${day} 天`,
      detail: '',
      readHref: groupPlanReaderHref(planId, day, groupId),
      primaryRef: '',
    };
  }
}
