'use client';

import { useState } from 'react';
import type { GroupDetail } from '@/lib/api';
import { GroupPlanStrip } from './GroupPlanStrip';
import { GroupWeeklySummary } from './GroupWeeklySummary';

type Props = {
  detail: GroupDetail;
  isOwner: boolean;
  checkinsThisWeek: number;
  activeDays: number;
  pendingMembers: number;
  nudgeBusy?: boolean;
  onNudge?: () => void;
  onShowMembers?: () => void;
};

export function GroupCollapsibleMeta({
  detail,
  isOwner,
  checkinsThisWeek,
  activeDays,
  pendingMembers,
  nudgeBusy,
  onNudge,
  onShowMembers,
}: Props) {
  const [open, setOpen] = useState(false);
  const planHint = detail.plan_title ? ` · ${detail.plan_title}` : '';
  const summary = `本周 ${checkinsThisWeek} 人次 · ${activeDays} 天有动态${planHint}`;

  return (
    <div className="group-collapsible-meta">
      <button
        type="button"
        className="group-collapsible-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="group-collapsible-summary muted">{summary}</span>
        <span className="group-collapsible-chevron" aria-hidden>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="group-collapsible-body">
          <GroupWeeklySummary
            checkinsThisWeek={checkinsThisWeek}
            activeDays={activeDays}
            memberCount={detail.members?.length ?? 0}
            isOwner={isOwner}
            onNudge={onNudge}
            nudgeBusy={nudgeBusy}
            pendingMembers={pendingMembers}
          />
          <GroupPlanStrip detail={detail} onShowMembers={onShowMembers} />
        </div>
      )}
    </div>
  );
}
