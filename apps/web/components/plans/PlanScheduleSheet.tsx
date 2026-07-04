'use client';

import type { PlanDayScheduleItem } from '@/lib/plan_schedule';
import type { ActivePlan } from '@/lib/plan_progress';
import { planCompletionPct } from '@/lib/plan_schedule';

type Props = {
  plan: ActivePlan;
  items: PlanDayScheduleItem[];
  busyDay?: number | null;
  currentDay?: number;
  onClose: () => void;
  onStartDay: (day: number) => void;
  onSkipDay?: (day: number) => void;
};

function dayCta(d: PlanDayScheduleItem, currentDay: number, kind: ActivePlan['kind']): string {
  if (d.completed) return '复习';
  if (d.skipped) return '补读 ›';
  if (!d.unlocked) return '未解锁';
  if (d.day === currentDay - 1) return '补读昨天 ›';
  return kind === 'prayer' ? '去祷告 ›' : '去读 ›';
}

export function PlanScheduleSheet({
  plan,
  items,
  busyDay,
  currentDay = 1,
  onClose,
  onStartDay,
  onSkipDay,
}: Props) {
  const pct = planCompletionPct(plan.planId, plan.days);
  const allDone = items.length > 0 && items.every((d) => d.completed);
  const doneCount = items.filter((d) => d.completed).length;
  const skippedCount = items.filter((d) => d.skipped).length;

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet card plan-schedule-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="half-sheet-grab" aria-hidden />
        <div className="section-row" style={{ marginTop: 0 }}>
          <strong>{plan.title}</strong>
          <button type="button" className="text-link" onClick={onClose}>关闭</button>
        </div>
        <p className="muted" style={{ fontSize: 12, margin: '4px 0 10px' }}>
          {plan.days} 天计划 · 已完成 {doneCount}/{plan.days} 天（{pct}%）
          {skippedCount > 0 ? ` · 跳过 ${skippedCount} 天` : ''}
          {allDone ? ' · 计划已全部完成 🎉' : ''}
        </p>
        <div className="progress-bar" style={{ marginBottom: 12 }}>
          <div className="progress-fill plan-fill" style={{ width: `${pct}%` }} />
        </div>

        <div className="plan-schedule-list">
          {items.map((d) => {
            const locked = !d.unlocked && !d.completed && !d.skipped;
            const canSkip = Boolean(
              onSkipDay
              && d.unlocked
              && !d.completed
              && !d.skipped
              && busyDay !== d.day,
            );
            const busy = busyDay === d.day;
            return (
              <div
                key={d.day}
                className={`plan-schedule-day${d.completed ? ' done' : ''}${d.skipped ? ' skipped' : ''}${d.unlocked && !d.completed ? ' unlocked' : ''}${locked ? ' locked' : ''}`}
              >
                <button
                  type="button"
                  className="plan-schedule-day-main-btn"
                  disabled={locked || busy}
                  onClick={() => onStartDay(d.day)}
                >
                  <span className="plan-schedule-day-num">
                    {d.completed ? '✓' : d.skipped ? '–' : locked ? '🔒' : d.day}
                  </span>
                  <span className="plan-schedule-day-main">
                    <strong>
                      第 {d.day} 天 · {d.title}
                      {d.day === currentDay && !d.completed ? ' · 今日' : ''}
                      {d.day === currentDay - 1 && !d.completed && !d.skipped && d.unlocked
                        ? ' · 可补读'
                        : ''}
                    </strong>
                    <span className="muted plan-schedule-day-detail">
                      {d.skipped ? '已跳过，可随时补读' : d.detail}
                    </span>
                  </span>
                  <span className="plan-schedule-day-cta">
                    {busy ? '…' : dayCta(d, currentDay, plan.kind)}
                  </span>
                </button>
                {canSkip && (
                  <button
                    type="button"
                    className="plan-schedule-skip"
                    onClick={() => onSkipDay?.(d.day)}
                  >
                    跳过
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
