'use client';

import { SheetCloseButton } from '@/components/PageBackBar';
import type { PlanDayScheduleItem } from '@/lib/plan_schedule';
import type { ActivePlan } from '@/lib/plan_progress';
import { planCompletionPct } from '@/lib/plan_schedule';

export type PlanScheduleMode = 'preview' | 'manage';

type Props = {
  plan: ActivePlan;
  items: PlanDayScheduleItem[];
  mode: PlanScheduleMode;
  intro?: string;
  busyDay?: number | null;
  currentDay?: number;
  primaryLabel?: string;
  secondaryLabel?: string;
  onClose: () => void;
  onPrimary?: () => void;
  onSecondary?: () => void;
  onStartDay?: (day: number) => void;
  onSkipDay?: (day: number) => void;
};

function dayCta(
  d: PlanDayScheduleItem,
  currentDay: number,
  kind: ActivePlan['kind'],
  mode: PlanScheduleMode,
): string {
  if (mode === 'preview') return kind === 'prayer' ? '查看 ›' : '预览 ›';
  if (d.completed) return '复习';
  if (d.skipped) return '补读 ›';
  if (!d.unlocked) return '未解锁';
  if (d.day === currentDay - 1) return '补读昨天 ›';
  return kind === 'prayer' ? '去祷告 ›' : '去读 ›';
}

export function PlanScheduleSheet({
  plan,
  items,
  mode,
  intro,
  busyDay,
  currentDay = 1,
  primaryLabel,
  secondaryLabel,
  onClose,
  onPrimary,
  onSecondary,
  onStartDay,
  onSkipDay,
}: Props) {
  const pct = planCompletionPct(plan.planId, plan.days);
  const allDone = items.length > 0 && items.every((d) => d.completed);
  const doneCount = items.filter((d) => d.completed).length;
  const skippedCount = items.filter((d) => d.skipped).length;
  const isPreview = mode === 'preview';
  const sample = items.slice(0, 3);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet card plan-schedule-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="half-sheet-grab" aria-hidden />
        <div className="section-row" style={{ marginTop: 0 }}>
          <strong>{plan.title}</strong>
          <SheetCloseButton onClick={onClose} />
        </div>
        <p className="muted" style={{ fontSize: 12, margin: '4px 0 8px' }}>
          {plan.kind === 'prayer' ? '祷告' : '读经'} · {plan.days} 天
          {isPreview
            ? ' · 预览'
            : ` · 已完成 ${doneCount}/${plan.days} 天（${pct}%）`}
          {!isPreview && skippedCount > 0 ? ` · 跳过 ${skippedCount} 天` : ''}
          {!isPreview && allDone ? ' · 计划已全部完成 🎉' : ''}
        </p>

        {isPreview && intro && (
          <p className="plan-schedule-intro">{intro}</p>
        )}

        {isPreview && sample.length > 0 && (
          <div className="plan-schedule-sample">
            <p className="plan-schedule-sample-label">前几天安排</p>
            {sample.map((d) => (
              <div key={d.day} className="plan-schedule-sample-row">
                <span className="plan-schedule-day-num">{d.day}</span>
                <span>
                  <strong>第 {d.day} 天 · {d.title}</strong>
                  {d.detail && (
                    <span className="muted plan-schedule-day-detail">{d.detail}</span>
                  )}
                </span>
              </div>
            ))}
            {items.length > 3 && (
              <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>
                点选某天可预览内容，不会开始计划
              </p>
            )}
          </div>
        )}

        {!isPreview && (
          <div className="progress-bar" style={{ marginBottom: 12 }}>
            <div className="progress-fill plan-fill" style={{ width: `${pct}%` }} />
          </div>
        )}

        <div className="plan-schedule-list">
          {items.map((d) => {
            const locked = !isPreview && !d.unlocked && !d.completed && !d.skipped;
            const canSkip = Boolean(
              !isPreview
              && onSkipDay
              && d.unlocked
              && !d.completed
              && !d.skipped
              && busyDay !== d.day,
            );
            const busy = busyDay === d.day;
            const interactive = isPreview ? Boolean(onStartDay) : !locked;
            return (
              <div
                key={d.day}
                className={`plan-schedule-day${d.completed ? ' done' : ''}${d.skipped ? ' skipped' : ''}${!isPreview && d.unlocked && !d.completed ? ' unlocked' : ''}${locked ? ' locked' : ''}${isPreview ? ' preview' : ''}`}
              >
                <button
                  type="button"
                  className="plan-schedule-day-main-btn"
                  disabled={!interactive || busy}
                  onClick={() => {
                    if (interactive) onStartDay?.(d.day);
                  }}
                >
                  <span className="plan-schedule-day-num">
                    {d.completed ? '✓' : d.skipped ? '–' : locked ? '🔒' : d.day}
                  </span>
                  <span className="plan-schedule-day-main">
                    <strong>
                      第 {d.day} 天 · {d.title}
                      {!isPreview && d.day === currentDay && !d.completed ? ' · 今日' : ''}
                      {!isPreview
                        && d.day === currentDay - 1
                        && !d.completed
                        && !d.skipped
                        && d.unlocked
                        ? ' · 可补读'
                        : ''}
                    </strong>
                    <span className="muted plan-schedule-day-detail">
                      {d.skipped ? '已跳过，可随时补读' : d.detail}
                    </span>
                  </span>
                  <span className="plan-schedule-day-cta">
                    {busy ? '…' : dayCta(d, currentDay, plan.kind, mode)}
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

        {(primaryLabel || secondaryLabel) && (
          <div className="plan-schedule-footer">
            {primaryLabel && onPrimary && (
              <button type="button" className="btn plan-schedule-primary" onClick={onPrimary}>
                {primaryLabel}
              </button>
            )}
            {secondaryLabel && onSecondary && (
              <button type="button" className="text-link plan-schedule-secondary" onClick={onSecondary}>
                {secondaryLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
