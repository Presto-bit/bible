'use client';

import { useState } from 'react';
import type { GeneratedPlan } from '@/lib/api';
import { loadGeneratedPlans } from '@/lib/generated_plans';
import { PlanGenerateSheet } from '@/components/plans/PlanGenerateSheet';

type Props = {
  busy?: boolean;
  onPlanSelected: (planId: string) => void;
  onGeneratedPlansChange: (plans: GeneratedPlan[]) => void;
};

export function GroupCustomPlanPanel({
  busy,
  onPlanSelected,
  onGeneratedPlansChange,
}: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="group-settings-row-btn group-settings-expand-btn"
        disabled={busy}
        onClick={() => setSheetOpen(true)}
      >
        <span>创建定制共读计划</span>
        <span className="muted">打开</span>
      </button>
      <p className="muted group-settings-hint" style={{ marginTop: 6 }}>
        与「计划」页相同的定制流程：名称、经节范围、日程与预览，生成后可绑定到本群。
      </p>
      <PlanGenerateSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSaved={(plan, _mode) => {
          onGeneratedPlansChange(loadGeneratedPlans());
          onPlanSelected(plan.id);
          setSheetOpen(false);
        }}
      />
    </>
  );
}
