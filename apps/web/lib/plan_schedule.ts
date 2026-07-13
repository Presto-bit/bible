import { api } from './api';
import {
  getCompletedPlanDays,
  isPlanDayCompleted,
  isPlanDaySkipped,
  isPlanDayUnlocked,
  type ActivePlan,
} from './plan_progress';
import { planDayLabel } from './plan_calendar';
import { loadGeneratedPlans } from './generated_plans';
import {
  stepsForReadingRows,
  type GeneratedDayRow,
  type ReadingDayRow,
} from './plan_steps';

export interface PlanDayScheduleItem {
  day: number;
  title: string;
  detail: string;
  unlocked: boolean;
  completed: boolean;
  skipped: boolean;
}

export async function loadPlanSchedule(plan: ActivePlan): Promise<PlanDayScheduleItem[]> {
  if (plan.source === 'generated') {
    try {
      const list = loadGeneratedPlans() as Array<{ id: string; days: GeneratedDayRow[] }>;
      const found = list.find((p) => p.id === plan.planId);
      if (!found) return [];
      return found.days.map((d) => ({
        day: d.day,
        title: d.date ? planDayLabel(d) : (d.title || `第 ${d.day} 天`),
        detail: d.refs?.join(' · ') || '',
        unlocked: isPlanDayUnlocked(plan.planId, d.day),
        completed: isPlanDayCompleted(plan.planId, d.day),
        skipped: isPlanDaySkipped(plan.planId, d.day),
      }));
    } catch {
      return [];
    }
  }

  const detail = await api.planDetail(plan.planId);
  if (plan.kind === 'prayer') {
    const days = (detail.days ?? []) as Array<{ day: number; title?: string }>;
    return days
      .map((d) => ({
        day: d.day,
        title: d.title?.trim() || `第 ${d.day} 天`,
        detail: '祷告',
        unlocked: isPlanDayUnlocked(plan.planId, d.day),
        completed: isPlanDayCompleted(plan.planId, d.day),
        skipped: isPlanDaySkipped(plan.planId, d.day),
      }))
      .sort((a, b) => a.day - b.day);
  }

  const rows = (detail.days ?? []) as ReadingDayRow[];
  const dayNums = [...new Set(rows.map((r) => r.day))].sort((a, b) => a - b);

  return dayNums.map((day) => {
    const steps = stepsForReadingRows(rows, day);
    const row = rows.find((r) => r.day === day);
    return {
      day,
      title: row?.title?.trim() || `第 ${day} 天`,
      detail: steps.map((s) => s.label).join(' · ') || '—',
      unlocked: isPlanDayUnlocked(plan.planId, day),
      completed: isPlanDayCompleted(plan.planId, day),
      skipped: isPlanDaySkipped(plan.planId, day),
    };
  });
}

export function planCompletionPct(planId: string, totalDays: number): number {
  if (totalDays <= 0) return 0;
  const done = getCompletedPlanDays(planId).length;
  return Math.round((done / totalDays) * 100);
}
