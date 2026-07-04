'use client';

import type { GeneratedPlan } from '@/lib/api';
import { planCompletionPct } from '@/lib/plan_schedule';
import { getCompletedPlanDays, getPlanDay, isPlanFullyCompleted } from '@/lib/plan_progress';

type Props = {
  plan: GeneratedPlan;
  isActive: boolean;
  onContinue: () => void;
  onPreview: () => void;
  onManage?: () => void;
  onShare: () => void;
  onDelete: () => void;
};

export function PlanCustomCard({
  plan,
  isActive,
  onContinue,
  onPreview,
  onManage,
  onShare,
  onDelete,
}: Props) {
  const doneDays = getCompletedPlanDays(plan.id).length;
  const pct = planCompletionPct(plan.id, plan.days_count);
  const currentDay = getPlanDay(plan.id) || 1;
  const finished = isPlanFullyCompleted(plan.id, plan.days_count);
  const savedAt = plan.saved_at ? new Date(plan.saved_at).toLocaleDateString('zh-CN') : null;

  const mainLabel = isActive
    ? (finished ? '查看日程' : doneDays > 0 ? '继续阅读' : '今日继续')
    : '查看计划';
  const onMain = isActive && !finished ? onContinue : onPreview;

  return (
    <article className={`card card-2 plan-custom-card${isActive ? ' plan-custom-card-active' : ''}`}>
      <div className="plan-custom-card-head">
        <div>
          {isActive && <span className="plan-custom-active-tag">进行中</span>}
          <strong className="plan-custom-title">{plan.title}</strong>
          <p className="muted plan-custom-meta">
            {plan.days_count} 天 · {plan.chapters_total} 章
            {savedAt ? ` · ${savedAt} 保存` : ''}
          </p>
        </div>
        <button type="button" className="text-link danger" onClick={onDelete}>删除</button>
      </div>

      <div className="plan-progress-bar" style={{ marginTop: 8 }}>
        <div className="plan-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>
        {finished ? '已全部完成' : `已完成 ${doneDays}/${plan.days_count} 天`}
        {!finished && doneDays > 0 ? ` · 下次第 ${currentDay} 天` : ''}
      </p>

      <div className="plan-custom-actions">
        <button type="button" className="btn plan-custom-btn-main" onClick={onMain}>
          {mainLabel}
        </button>
        {isActive && !finished && (
          <button type="button" className="font-pill" onClick={onManage ?? onPreview}>日程</button>
        )}
        {!isActive && (
          <button type="button" className="font-pill" onClick={onPreview}>详情</button>
        )}
        <button type="button" className="font-pill" onClick={onShare}>分享到群</button>
      </div>
    </article>
  );
}
