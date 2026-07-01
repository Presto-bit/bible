'use client';

import { useState } from 'react';
import type { PlanSession } from '@/lib/plan_session';
import type { PlanStep } from '@/lib/plan_steps';
import { sessionProgress } from '@/lib/plan_steps';

export interface PlanReadingMeta {
  planId: string;
  planTitle: string;
  day: number;
  totalDays: number;
  steps: PlanStep[];
  session: PlanSession;
}

export default function PlanBar({
  meta,
  onOpenSheet,
  onJumpStep,
}: {
  meta: PlanReadingMeta;
  onOpenSheet: () => void;
  onJumpStep: (index: number) => void;
}) {
  const { done, total } = sessionProgress(meta.steps, meta.session.stepsDone);
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="plan-read-bar">
      <button type="button" className="plan-read-bar-main" onClick={() => setExpanded((x) => !x)}>
        <span className="plan-read-bar-title">
          📅 {meta.planTitle} · 第 {meta.day}/{meta.totalDays} 天
        </span>
        <span className="plan-read-bar-meta">{done}/{total} 段</span>
        <span className="plan-read-bar-chevron">{expanded ? '▾' : '▸'}</span>
      </button>
      {expanded && (
        <div className="plan-read-steps">
          {meta.steps.map((s, i) => {
            const isDone = meta.session.stepsDone.includes(s.id);
            const isActive = i === meta.session.currentStepIndex && !isDone;
            return (
              <button
                key={s.id}
                type="button"
                className={`plan-read-step ${isDone ? 'plan-read-step-done' : ''} ${isActive ? 'plan-read-step-active' : ''}`}
                onClick={() => onJumpStep(i)}
              >
                <span className="plan-read-step-dot">{isDone ? '✓' : i + 1}</span>
                <span className="plan-read-step-label">{s.label}</span>
              </button>
            );
          })}
          <button type="button" className="text-link plan-read-detail" onClick={onOpenSheet}>
            查看今日安排
          </button>
        </div>
      )}
    </div>
  );
}
