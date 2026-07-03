'use client';

import { useState } from 'react';
import { api, type GeneratedPlan } from '@/lib/api';
import { loadGeneratedPlans, saveGeneratedPlan } from '@/lib/generated_plans';

type Props = {
  planScopes: { id: string; label: string }[];
  busy?: boolean;
  onPlanSelected: (planId: string) => void;
  onGeneratedPlansChange: (plans: GeneratedPlan[]) => void;
};

export function GroupCustomPlanPanel({
  planScopes,
  busy,
  onPlanSelected,
  onGeneratedPlansChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [customScope, setCustomScope] = useState<string | null>(null);
  const [customDays, setCustomDays] = useState(30);
  const [customRefs, setCustomRefs] = useState('');
  const [customTheme, setCustomTheme] = useState('');
  const [genBusy, setGenBusy] = useState(false);
  const [genErr, setGenErr] = useState<string | null>(null);

  const generateCustomPlan = async () => {
    if (!customScope && !customRefs.trim()) {
      setGenErr('请选择范围或填写经节');
      return;
    }
    setGenBusy(true);
    setGenErr(null);
    try {
      const preview = await api.generatePlan(
        customScope,
        customDays,
        customTheme.trim() || undefined,
        customRefs.trim() || undefined,
      );
      saveGeneratedPlan(preview);
      onGeneratedPlansChange(loadGeneratedPlans());
      onPlanSelected(preview.id);
      setOpen(false);
    } catch (e) {
      setGenErr(e instanceof Error ? e.message : String(e));
    } finally {
      setGenBusy(false);
    }
  };

  return (
    <div className="group-custom-plan-collapsible">
      <button
        type="button"
        className="group-settings-row-btn group-settings-expand-btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>创建定制共读计划</span>
        <span className="muted">{open ? '收起' : '展开'}</span>
      </button>
      {open && (
        <div className="group-custom-plan-box">
          <p className="muted group-settings-hint">
            选择读经范围与天数，生成后自动绑定到本群。
          </p>
          <div className="chip-swipe group-chip-swipe" style={{ marginBottom: 8 }}>
            {planScopes.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`group-chip chip-swipe-item${customScope === s.id ? ' selected' : ''}`}
                onClick={() => setCustomScope(customScope === s.id ? null : s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>
          <input
            className="search-input"
            placeholder="或填写经节，如 约翰福音 1–3 章"
            value={customRefs}
            onChange={(e) => setCustomRefs(e.target.value)}
          />
          <p className="muted group-settings-hint" style={{ marginTop: 8 }}>
            天数：{customDays} 天
          </p>
          <input
            type="range"
            min={7}
            max={90}
            step={1}
            value={customDays}
            onChange={(e) => setCustomDays(Number(e.target.value))}
            style={{ width: '100%' }}
          />
          <input
            className="search-input"
            style={{ marginTop: 8 }}
            placeholder="主题（可选）"
            value={customTheme}
            onChange={(e) => setCustomTheme(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-block"
            disabled={genBusy || busy}
            onClick={() => void generateCustomPlan()}
          >
            {genBusy ? '生成中…' : '生成并绑定'}
          </button>
          {genErr && <p className="group-composer-err">{genErr}</p>}
        </div>
      )}
    </div>
  );
}
