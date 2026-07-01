'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, type GeneratedPlan, type PlanSummary } from '@/lib/api';
import {
  advancePlanDay,
  cancelActivePlan,
  getActivePlan,
  getPlanDay,
  setActivePlan,
  setPlanDay,
  type ActivePlan,
} from '@/lib/plan_progress';
import { buildPlanReadingMeta, readerHref } from '@/lib/plan_reading';
import { getPlanSession } from '@/lib/plan_session';
import { sessionProgress } from '@/lib/plan_steps';

function groupPlans(plans: PlanSummary[]) {
  const groups = [
    { label: '7 天入门', items: plans.filter((p) => p.days <= 7) },
    { label: '15–30 天', items: plans.filter((p) => p.days > 7 && p.days <= 30) },
    { label: '长期通读', items: plans.filter((p) => p.days > 30) },
  ];
  return groups.filter((g) => g.items.length > 0);
}

function PlanRow({
  title,
  days,
  kind,
  onClick,
}: {
  title: string;
  days: number;
  kind: 'reading' | 'prayer';
  onClick: () => void;
}) {
  return (
    <button type="button" className="plan-row" onClick={onClick}>
      <div className="plan-row-main">
        <span className="plan-row-title">{title}</span>
        <span className="plan-row-meta">{days} 天</span>
      </div>
      <span className={`pill plan-row-tag ${kind === 'reading' ? 'pill-active' : ''}`}>
        {kind === 'prayer' ? '祷告' : '读经'}
      </span>
      <span className="plan-row-chevron" aria-hidden>›</span>
    </button>
  );
}

export default function PlansPage() {
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [scopes, setScopes] = useState<{ id: string; label: string }[]>([]);
  const [scope, setScope] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [prompt, setPrompt] = useState('');
  const [customRefs, setCustomRefs] = useState('');
  const [preview, setPreview] = useState<GeneratedPlan | null>(null);
  const [showGenerate, setShowGenerate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<'reading' | 'prayer'>('reading');
  const [active, setActive] = useState<ActivePlan | null>(null);
  const [savedPlans, setSavedPlans] = useState<GeneratedPlan[]>([]);

  useEffect(() => {
    api.plans().then((d) => setPlans(d.plans)).catch((e) => setErr(String(e)));
    api.planScopes().then((d) => setScopes(d.scopes)).catch(() => {});
    setActive(getActivePlan());
    try {
      setSavedPlans(JSON.parse(localStorage.getItem('presto_generated_plans') || '[]'));
    } catch {
      setSavedPlans([]);
    }
  }, []);

  const featured = useMemo(
    () => plans.filter((p) => (tab === 'prayer' ? p.type === 'prayer' : p.type !== 'prayer')),
    [plans, tab],
  );

  const grouped = useMemo(() => groupPlans(featured), [featured]);

  const [activeProgress, setActiveProgress] = useState<string | null>(null);
  const activeDay = active ? getPlanDay(active.planId) : 0;

  const goReadPlan = async (plan: ActivePlan, day: number) => {
    setActivePlan(plan);
    setPlanDay(plan.planId, day);
    setActive(plan);
    const meta = await buildPlanReadingMeta(plan, day);
    if (meta) window.location.href = readerHref(meta);
  };

  useEffect(() => {
    if (!active) {
      setActiveProgress(null);
      return;
    }
    const day = getPlanDay(active.planId) || 1;
    buildPlanReadingMeta(active, day)
      .then((meta) => {
        if (!meta) {
          setActiveProgress(null);
          return;
        }
        const sess = getPlanSession(active.planId, day) ?? meta.session;
        const p = sessionProgress(meta.steps, sess.stepsDone);
        setActiveProgress(`${p.done}/${p.total} 段`);
      })
      .catch(() => setActiveProgress(null));
  }, [active, activeDay]);

  const startPlanAndRead = async (
    p: { planId?: string; id?: string; title: string; type?: string; days?: number; days_count?: number },
    source: 'featured' | 'generated',
  ) => {
    const planId = p.planId ?? p.id ?? '';
    const ap: ActivePlan = {
      planId,
      title: p.title,
      kind: p.type === 'prayer' ? 'prayer' : 'reading',
      days: p.days ?? p.days_count ?? 0,
      source,
    };
    if (ap.kind === 'prayer') {
      startPlan(p, source);
      return;
    }
    const day = getPlanDay(planId) || 1;
    await goReadPlan(ap, day);
  };

  const cancelPlan = () => {
    cancelActivePlan();
    setActive(null);
  };

  const saveGenerated = () => {
    if (!preview) return;
    const next = [preview, ...savedPlans.filter((x) => x.id !== preview.id)].slice(0, 12);
    localStorage.setItem('presto_generated_plans', JSON.stringify(next));
    setSavedPlans(next);
  };

  const generate = async () => {
    if (!scope && !customRefs.trim()) {
      setErr('请选择读经范围，或填写自定义经节');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      setPreview(await api.generatePlan(scope, days, prompt.trim() || undefined, customRefs.trim() || undefined));
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  const startPlan = (p: { planId?: string; id?: string; title: string; type?: string; days?: number; days_count?: number }, source: 'featured' | 'generated') => {
    const planId = p.planId ?? p.id ?? '';
    const ap: ActivePlan = {
      planId,
      title: p.title,
      kind: p.type === 'prayer' ? 'prayer' : 'reading',
      days: p.days ?? p.days_count ?? 0,
      source,
    };
    setActivePlan(ap);
    if (getPlanDay(planId) === 0) setPlanDay(planId, 1);
    setActive(ap);
  };

  return (
    <main className="container">
      <header className="plans-page-head">
        <Link href="/" className="icon-btn" aria-label="返回">←</Link>
        <h2 className="page-title" style={{ margin: 0, flex: 1 }}>读经计划</h2>
        <button type="button" className="text-link" onClick={() => setShowGenerate(true)}>定制</button>
      </header>

      {active && (
        <div className="card card-tint plan-active-compact">
          <div className="plan-active-top">
            <span className="plan-active-label">进行中的计划</span>
            <button type="button" className="text-link" style={{ fontSize: 12 }} onClick={cancelPlan}>取消</button>
          </div>
          <strong className="plan-active-title">{active.title}</strong>
          <div className="plan-active-foot">
            <span className="plan-active-meta">
              {active.kind === 'prayer' ? '祷告' : '读经'} · 第 {activeDay}/{active.days} 天
              {activeProgress ? ` · ${activeProgress}` : ''}
            </span>
            <div className="plan-progress-bar">
              <div className="plan-progress-fill" style={{ width: `${active.days ? Math.round((activeDay / active.days) * 100) : 0}%` }} />
            </div>
            <button
              type="button"
              className="text-link"
              style={{ fontSize: 12, whiteSpace: 'nowrap' }}
              onClick={() => goReadPlan(active, activeDay || 1)}
            >
              {active.kind === 'prayer' ? '去祷告' : '去读 ›'}
            </button>
            <button type="button" className="text-link" style={{ fontSize: 12, whiteSpace: 'nowrap' }} onClick={() => { advancePlanDay(active.planId, active.days); setActive({ ...active }); }}>
              完成
            </button>
          </div>
        </div>
      )}

      <div className="mode-row" style={{ marginBottom: 12 }}>
        <button type="button" className={`mode-chip ${tab === 'reading' ? 'mode-chip-active' : ''}`} onClick={() => setTab('reading')}>读经计划</button>
        <button type="button" className={`mode-chip ${tab === 'prayer' ? 'mode-chip-active' : ''}`} onClick={() => setTab('prayer')}>祷告计划</button>
      </div>

      <div className="plans-section-head">
        <h3>热门计划</h3>
        <span>{featured.length} 个</span>
      </div>

      {grouped.map((group) => (
        <section key={group.label}>
          <p className="plan-section-label">{group.label}</p>
          <div className="plan-list" style={{ marginBottom: 10 }}>
            {group.items.map((p) => (
              <PlanRow
                key={p.plan_id}
                title={p.title}
                days={p.days}
                kind={p.type === 'prayer' ? 'prayer' : 'reading'}
                onClick={() => startPlanAndRead({ planId: p.plan_id, title: p.title, type: p.type, days: p.days }, 'featured')}
              />
            ))}
          </div>
        </section>
      ))}

      {savedPlans.length > 0 && (
        <>
          <div className="plans-section-head" style={{ marginTop: 8 }}>
            <h3>我的定制</h3>
            <span>{savedPlans.length} 个</span>
          </div>
          <div className="plan-list">
            {savedPlans.map((p) => (
              <PlanRow
                key={p.id}
                title={p.title}
                days={p.days_count}
                kind="reading"
                onClick={() => startPlanAndRead({ id: p.id, title: p.title, days_count: p.days_count }, 'generated')}
              />
            ))}
          </div>
        </>
      )}

      {showGenerate && (
        <div className="sheet-backdrop" onClick={() => { setShowGenerate(false); setPreview(null); }}>
          <div className="sheet card plans-generate-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="section-row" style={{ marginTop: 0 }}>
              <strong>定制计划</strong>
              <button type="button" className="text-link" onClick={() => { setShowGenerate(false); setPreview(null); }}>关闭</button>
            </div>
            <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>选择范围与天数，生成每日读经安排</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              {scopes.map((s) => (
                <button key={s.id} type="button" className="book-chip" style={{ width: 'auto', background: scope === s.id ? 'var(--accent-wash)' : 'var(--surface)', borderColor: scope === s.id ? 'var(--accent)' : 'var(--line)' }} onClick={() => { setScope(scope === s.id ? null : s.id); setPreview(null); }}>
                  {s.label}
                </button>
              ))}
            </div>
            <label className="muted">天数：{days}</label>
            <input type="range" min={7} max={180} value={days} style={{ width: '100%' }} onChange={(e) => { setDays(Number(e.target.value)); setPreview(null); }} />
            <input className="book-chip" style={{ width: '100%', textAlign: 'left', margin: '8px 0' }} placeholder="计划提词（将作为计划名称）" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
            <input className="book-chip" style={{ width: '100%', textAlign: 'left', margin: '4px 0 8px' }} placeholder="自定义经节（可选，例 GEN.1, PSA.23）" value={customRefs} onChange={(e) => { setCustomRefs(e.target.value); setPreview(null); }} />
            <button type="button" className="btn" style={{ marginTop: 8, width: '100%' }} onClick={generate} disabled={busy}>
              {busy ? '生成中…' : '生成计划'}
            </button>
            {err && <p style={{ color: '#b1554a', marginTop: 8 }}>{err}</p>}
            {preview && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
                <strong>{preview.title}</strong>
                <p className="muted" style={{ fontSize: 12 }}>{preview.days_count} 天 · 共 {preview.chapters_total} 章</p>
                {preview.days.slice(0, 5).map((d) => (
                  <div key={d.day} className="verse-row"><span className="verse-no">{d.day}</span>{d.title}</div>
                ))}
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button type="button" className="btn" style={{ flex: 1 }} onClick={() => { startPlan({ id: preview.id, title: preview.title, days_count: preview.days_count }, 'generated'); setShowGenerate(false); }}>
                    设为当前计划
                  </button>
                  <button type="button" className="book-chip" style={{ flex: 1 }} onClick={saveGenerated}>保存</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
