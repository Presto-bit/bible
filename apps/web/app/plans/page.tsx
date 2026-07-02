'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, ensureAccountReady, type GeneratedPlan, type PlanSummary } from '@/lib/api';
import { markGroupsListDirty, stashCreatedGroup } from '@/lib/groups_refresh';
import { GROUP_INACTIVE_NOTICE } from '@/lib/group_policy';
import { PlanScheduleSheet } from '@/components/plans/PlanScheduleSheet';
import { PlanCategoryGrid } from '@/components/plans/PlanCategoryGrid';
import {
  cancelActivePlan,
  getActivePlan,
  getCompletedPlanDays,
  getPlanDay,
  isPlanDayUnlocked,
  markPlanDayCompleted,
  setActivePlan,
  setPlanDay,
  tryAutoCompletePlan,
  advancePlanDay,
  type ActivePlan,
} from '@/lib/plan_progress';
import { loadPlanSchedule, planCompletionPct, type PlanDayScheduleItem } from '@/lib/plan_schedule';
import { logPrayer } from '@/lib/reading';
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

function toActivePlan(
  p: { planId?: string; id?: string; title: string; type?: string; days?: number; days_count?: number },
  source: 'featured' | 'generated',
): ActivePlan {
  const planId = p.planId ?? p.id ?? '';
  return {
    planId,
    title: p.title,
    kind: p.type === 'prayer' ? 'prayer' : 'reading',
    days: p.days ?? p.days_count ?? 0,
    source,
  };
}

export default function PlansPage() {
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [scopes, setScopes] = useState<{ id: string; label: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [listErr, setListErr] = useState<string | null>(null);
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
  const [prayerSheet, setPrayerSheet] = useState<Awaited<ReturnType<typeof api.prayerToday>> | null>(null);
  const [toast, setToast] = useState('');
  const [schedulePlan, setSchedulePlan] = useState<ActivePlan | null>(null);
  const [scheduleItems, setScheduleItems] = useState<PlanDayScheduleItem[]>([]);
  const [scheduleBusyDay, setScheduleBusyDay] = useState<number | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);

  const flashToast = (t: string) => {
    setToast(t);
    window.setTimeout(() => setToast(''), 2000);
  };

  useEffect(() => {
    setLoading(true);
    setListErr(null);
    Promise.all([api.plans(), api.planScopes()])
      .then(([p, s]) => {
        setPlans(p.plans);
        setScopes(s.scopes);
      })
      .catch((e) => setListErr(String(e)))
      .finally(() => setLoading(false));
    setActive(getActivePlan());
    try {
      setSavedPlans(JSON.parse(localStorage.getItem('presto_generated_plans') || '[]'));
    } catch {
      setSavedPlans([]);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('tab') === 'prayer') setTab('prayer');
  }, []);

  const featured = useMemo(
    () => plans.filter((p) => (tab === 'prayer' ? p.type === 'prayer' : p.type !== 'prayer')),
    [plans, tab],
  );

  const grouped = useMemo(() => groupPlans(featured), [featured]);

  const [activeProgress, setActiveProgress] = useState<string | null>(null);
  const activeDay = active ? getPlanDay(active.planId) : 0;
  const activeCompletedDays = active ? getCompletedPlanDays(active.planId).length : 0;
  const activePct = active ? planCompletionPct(active.planId, active.days) : 0;

  const openSchedule = useCallback(async (ap: ActivePlan) => {
    if (tryAutoCompletePlan(ap.planId, ap.days)) {
      setActive(null);
      flashToast('计划已全部完成 🎉');
      return;
    }
    setActivePlan(ap);
    if (getPlanDay(ap.planId) === 0) setPlanDay(ap.planId, 1);
    setActive(ap);
    setSchedulePlan(ap);
    setScheduleLoading(true);
    setScheduleItems([]);
    try {
      const items = await loadPlanSchedule(ap);
      setScheduleItems(items);
    } catch (e) {
      flashToast(String(e));
      setSchedulePlan(null);
    } finally {
      setScheduleLoading(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const highlight = params.get('highlight');
    if (!highlight || loading) return;
    const fromFeatured = plans.find((p) => p.plan_id === highlight);
    if (fromFeatured) {
      void openSchedule(toActivePlan(
        { planId: fromFeatured.plan_id, title: fromFeatured.title, type: fromFeatured.type, days: fromFeatured.days },
        'featured',
      ));
      return;
    }
    const fromSaved = savedPlans.find((p) => p.id === highlight);
    if (fromSaved) {
      void openSchedule(toActivePlan(
        { id: fromSaved.id, title: fromSaved.title, days_count: fromSaved.days_count },
        'generated',
      ));
    }
  }, [loading, plans, savedPlans, openSchedule]);

  const goReadPlan = async (plan: ActivePlan, day: number) => {
    if (plan.kind === 'prayer') {
      setPlanDay(plan.planId, day);
      try {
        setPrayerSheet(await api.prayerToday());
      } catch (e) {
        flashToast(`祷告内容加载失败：${e}`);
      }
      return;
    }
    setActivePlan(plan);
    setPlanDay(plan.planId, day);
    setActive(plan);
    try {
      const meta = await buildPlanReadingMeta(plan, day);
      if (meta) window.location.href = readerHref(meta);
      else flashToast('今日计划暂无内容，请换一天或重新选择计划');
    } catch (e) {
      flashToast(String(e));
    }
  };

  const handleScheduleDay = async (day: number) => {
    if (!schedulePlan) return;
    if (!isPlanDayUnlocked(schedulePlan.planId, day) && !scheduleItems.find((d) => d.day === day)?.completed) {
      flashToast(`请先完成第 ${day - 1} 天`);
      return;
    }
    setScheduleBusyDay(day);
    setSchedulePlan(null);
    await goReadPlan(schedulePlan, day);
    setScheduleBusyDay(null);
  };

  useEffect(() => {
    if (!active) {
      setActiveProgress(null);
      return;
    }
    const day = getPlanDay(active.planId) || 1;
    if (active.kind === 'prayer') {
      setActiveProgress(null);
      return;
    }
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
    const ap = toActivePlan(p, source);
    setActivePlan(ap);
    if (getPlanDay(ap.planId) === 0) setPlanDay(ap.planId, 1);
    setActive(ap);
  };

  const cancelPlan = () => {
    cancelActivePlan();
    setActive(null);
  };

  return (
    <main className="container">
      <header className="plans-page-head">
        <Link href="/" className="icon-btn" aria-label="返回">←</Link>
        <h2 className="page-title" style={{ margin: 0, flex: 1 }}>读经计划</h2>
        <button type="button" className="text-link plans-customize-btn" onClick={() => setShowGenerate(true)}>个性定制</button>
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
              {active.kind === 'prayer' ? '祷告' : '读经'} · 已完成 {activeCompletedDays}/{active.days} 天
              {activeProgress ? ` · ${activeProgress}` : ''}
            </span>
            <div className="plan-progress-bar">
              <div className="plan-progress-fill" style={{ width: `${activePct}%` }} />
            </div>
            <button
              type="button"
              className="text-link"
              style={{ fontSize: 12, whiteSpace: 'nowrap' }}
              onClick={() => openSchedule(active)}
            >
              日程表 ›
            </button>
            {active.kind !== 'prayer' && (
              <button
                type="button"
                className="font-pill plan-invite-btn"
                style={{ marginTop: 8 }}
                onClick={async () => {
                  if (!window.confirm(`将创建共读群并邀请好友加入。\n\n${GROUP_INACTIVE_NOTICE}\n\n继续创建？`)) return;
                  try {
                    await ensureAccountReady();
                    const g = await api.createGroupFromPlan(active.planId, `${active.title} · 共读`);
                    stashCreatedGroup({
                      id: g.id,
                      name: g.name || `${active.title} · 共读`,
                      join_code: g.join_code,
                      role: g.role || 'owner',
                    });
                    markGroupsListDirty();
                    window.location.href = `/discover/group/${g.id}`;
                  } catch (e) {
                    flashToast(String(e));
                  }
                }}
              >
                邀请组队共读
              </button>
            )}
          </div>
        </div>
      )}

      <div className="mode-row" style={{ marginBottom: 12 }}>
        <button type="button" className={`mode-chip ${tab === 'reading' ? 'mode-chip-active' : ''}`} onClick={() => setTab('reading')}>读经计划</button>
        <button type="button" className={`mode-chip ${tab === 'prayer' ? 'mode-chip-active' : ''}`} onClick={() => setTab('prayer')}>祷告计划</button>
      </div>

      <div className="plans-section-head">
        <h3>热门计划</h3>
        <span>{loading ? '…' : `${featured.length} 个`}</span>
      </div>

      {loading && <p className="muted" style={{ marginBottom: 12 }}>加载计划中…</p>}
      {listErr && (
        <p style={{ color: '#b1554a', marginBottom: 12 }}>
          计划加载失败，请检查网络后刷新。
        </p>
      )}
      {!loading && !listErr && featured.length === 0 && (
        <p className="muted" style={{ marginBottom: 12 }}>暂无计划，请稍后重试或联系管理员检查服务端数据。</p>
      )}

      {grouped.map((group) => (
        <section key={group.label}>
          <p className="plan-section-label">{group.label}</p>
          <PlanCategoryGrid
            items={group.items.map((p) => ({
              id: p.plan_id,
              title: p.title,
              days: p.days,
              kind: p.type === 'prayer' ? 'prayer' : 'reading',
              onClick: () => openSchedule(toActivePlan(
                { planId: p.plan_id, title: p.title, type: p.type, days: p.days },
                'featured',
              )),
            }))}
          />
        </section>
      ))}

      {savedPlans.length > 0 && (
        <>
          <div className="plans-section-head" style={{ marginTop: 8 }}>
            <h3>我的定制</h3>
            <span>{savedPlans.length} 个</span>
          </div>
          <PlanCategoryGrid
            items={savedPlans.map((p) => ({
              id: p.id,
              title: p.title,
              days: p.days_count,
              kind: 'reading' as const,
              onClick: () => openSchedule(toActivePlan(
                { id: p.id, title: p.title, days_count: p.days_count },
                'generated',
              )),
            }))}
          />
        </>
      )}

      {schedulePlan && (
        scheduleLoading ? (
          <div className="sheet-backdrop" onClick={() => setSchedulePlan(null)}>
            <div className="sheet card plan-schedule-sheet" onClick={(e) => e.stopPropagation()}>
              <p className="muted" style={{ textAlign: 'center', padding: 24 }}>加载日程…</p>
            </div>
          </div>
        ) : (
          <PlanScheduleSheet
            plan={schedulePlan}
            items={scheduleItems}
            busyDay={scheduleBusyDay}
            onClose={() => setSchedulePlan(null)}
            onStartDay={handleScheduleDay}
          />
        )
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
                  <button type="button" className="btn" style={{ flex: 1 }} onClick={() => {
                    saveGenerated();
                    const ap = toActivePlan({ id: preview.id, title: preview.title, days_count: preview.days_count }, 'generated');
                    startPlan({ id: preview.id, title: preview.title, days_count: preview.days_count }, 'generated');
                    setShowGenerate(false);
                    void openSchedule(ap);
                  }}>
                    设为当前计划
                  </button>
                  <button type="button" className="book-chip" style={{ flex: 1 }} onClick={saveGenerated}>保存</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {prayerSheet && (
        <div className="sheet-backdrop" onClick={() => setPrayerSheet(null)}>
          <div className="sheet card" onClick={(e) => e.stopPropagation()}>
            <div className="section-row" style={{ marginTop: 0 }}>
              <strong>{prayerSheet.title}</strong>
              <button type="button" className="text-link" onClick={() => setPrayerSheet(null)}>关闭</button>
            </div>
            {prayerSheet.scripture?.ref && (
              <p className="muted" style={{ fontSize: 13 }}>{prayerSheet.scripture.ref}</p>
            )}
            {prayerSheet.scripture?.text && (
              <blockquote style={{ margin: '10px 0', paddingLeft: 12, borderLeft: '3px solid var(--accent)' }}>
                {prayerSheet.scripture.text}
              </blockquote>
            )}
            {(['adoration', 'confession', 'thanksgiving', 'supplication'] as const).map((k) => {
              const label = { adoration: '敬拜', confession: '认罪', thanksgiving: '感恩', supplication: '祈求' }[k];
              const text = prayerSheet.acts?.[k];
              if (!text) return null;
              return (
                <div key={k} style={{ marginTop: 10 }}>
                  <strong style={{ fontSize: 13 }}>{label}</strong>
                  <p style={{ margin: '4px 0 0', lineHeight: 1.7 }}>{text}</p>
                </div>
              );
            })}
            {prayerSheet.prompt && (
              <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>{prayerSheet.prompt}</p>
            )}
            <button
              type="button"
              className="btn"
              style={{ marginTop: 16, width: '100%' }}
              onClick={() => {
                logPrayer();
                const activePrayer = getActivePlan();
                if (activePrayer?.kind === 'prayer') {
                  const day = getPlanDay(activePrayer.planId) || 1;
                  markPlanDayCompleted(activePrayer.planId, day);
                  advancePlanDay(activePrayer.planId, activePrayer.days);
                  if (tryAutoCompletePlan(activePrayer.planId, activePrayer.days)) {
                    setActive(null);
                    flashToast('计划已全部完成 🎉');
                  } else {
                    setActive({ ...activePrayer });
                    flashToast('已记录今日祷告');
                  }
                } else {
                  flashToast('已记录今日祷告');
                }
                setPrayerSheet(null);
              }}
            >
              完成今日祷告
            </button>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}
