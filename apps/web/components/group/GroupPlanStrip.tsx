'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { GroupDetail } from '@/lib/api';
import {
  adoptGroupPlan,
  groupPlanProgressLabel,
  groupPlanReaderHref,
  isOnGroupPlan,
} from '@/lib/group_plan';
import { groupMemberCount } from '@/lib/group_ui';

type Props = {
  detail: GroupDetail;
  onShowMembers?: () => void;
};

export function GroupPlanStrip({ detail, onShowMembers }: Props) {
  const [busy, setBusy] = useState(false);

  if (!detail.plan_id || !detail.plan_title) return null;

  const pct = detail.plan_progress_pct ?? 0;
  const joined = isOnGroupPlan(detail.plan_id);
  const myDay = detail.my_plan_day ?? 0;
  const readDay = myDay > 0 ? myDay : 1;
  const progressText = groupPlanProgressLabel({
    plan_day_avg: detail.plan_day_avg,
    plan_days_total: detail.plan_days_total,
    my_plan_day: detail.my_plan_day,
    members_on_plan: detail.members_on_plan,
    members: groupMemberCount(detail),
  });

  const adoptAndRead = async () => {
    setBusy(true);
    try {
      await adoptGroupPlan(detail.plan_id!, myDay > 0 ? myDay : undefined);
      window.location.href = groupPlanReaderHref(detail.plan_id!, readDay);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="group-plan-strip card card-2">
      <div className="group-plan-strip-head">
        <div>
          <span className="group-composer-label">群共读计划</span>
          <strong style={{ display: 'block', marginTop: 4 }}>{detail.plan_title}</strong>
        </div>
        {joined ? (
          <Link className="font-pill accent" href={groupPlanReaderHref(detail.plan_id, readDay)}>
            继续读 ›
          </Link>
        ) : (
          <button
            type="button"
            className="font-pill accent"
            disabled={busy}
            onClick={adoptAndRead}
          >
            {busy ? '…' : '加入并读 ›'}
          </button>
        )}
      </div>
      {progressText && (
        <p className="muted" style={{ fontSize: 12, margin: '8px 0' }}>
          {progressText}
        </p>
      )}
      <div className="progress-bar">
        <div className="progress-fill plan-fill" style={{ width: `${pct}%` }} />
      </div>
      {onShowMembers && (detail.members_on_plan ?? 0) > 0 && (
        <button type="button" className="text-link" style={{ fontSize: 12, marginTop: 8 }} onClick={onShowMembers}>
          查看成员进度 ›
        </button>
      )}
    </div>
  );
}
