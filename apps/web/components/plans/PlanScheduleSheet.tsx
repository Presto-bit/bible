'use client';

import type { PlanDayScheduleItem } from '@/lib/plan_schedule';
import type { ActivePlan } from '@/lib/plan_progress';
import { planCompletionPct } from '@/lib/plan_schedule';

type Props = {
  plan: ActivePlan;
  items: PlanDayScheduleItem[];
  busyDay?: number | null;
  onClose: () => void;
  onStartDay: (day: number) => void;
};

export function PlanScheduleSheet({
  plan,
  items,
  busyDay,
  onClose,
  onStartDay,
}: Props) {
  const pct = planCompletionPct(plan.planId, plan.days);
  const allDone = items.length > 0 && items.every((d) => d.completed);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet card plan-schedule-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="half-sheet-grab" aria-hidden />
        <div className="section-row" style={{ marginTop: 0 }}>
          <strong>{plan.title}</strong>
          <button type="button" className="text-link" onClick={onClose}>关闭</button>
        </div>
        <p className="muted" style={{ fontSize: 12, margin: '4px 0 10px' }}>
          {plan.days} 天计划 · 已完成 {pct}%
          {allDone ? ' · 计划已全部完成 🎉' : ''}
        </p>
        <div className="progress-bar" style={{ marginBottom: 12 }}>
          <div className="progress-fill plan-fill" style={{ width: `${pct}%` }} />
        </div>

        <div className="plan-schedule-list">
          {items.map((d) => {
            const locked = !d.unlocked && !d.completed;
            return (
              <button
                key={d.day}
                type="button"
                className={`plan-schedule-day${d.completed ? ' done' : ''}${d.unlocked && !d.completed ? ' unlocked' : ''}${locked ? ' locked' : ''}`}
                disabled={locked || busyDay === d.day}
                onClick={() => onStartDay(d.day)}
              >
                <span className="plan-schedule-day-num">
                  {d.completed ? '✓' : locked ? '🔒' : d.day}
                </span>
                <span className="plan-schedule-day-main">
                  <strong>第 {d.day} 天 · {d.title}</strong>
                  <span className="muted plan-schedule-day-detail">{d.detail}</span>
                </span>
                <span className="plan-schedule-day-cta">
                  {d.completed ? '复习' : locked ? '未解锁' : busyDay === d.day ? '…' : '去读 ›'}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
