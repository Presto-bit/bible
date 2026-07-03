'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, ensureAccountReady, type GeneratedPlan, type PlanSummary } from '@/lib/api';
import { markGroupsListDirty, stashCreatedGroup } from '@/lib/groups_refresh';
import { GROUP_INACTIVE_NOTICE } from '@/lib/group_policy';
import { loadGeneratedPlans, removeGeneratedPlan } from '@/lib/generated_plans';
import { PlanScheduleSheet } from '@/components/plans/PlanScheduleSheet';
import { PlanCategoryGrid } from '@/components/plans/PlanCategoryGrid';
import { PlanCustomCard } from '@/components/plans/PlanCustomCard';
import { PlanGenerateSheet } from '@/components/plans/PlanGenerateSheet';
import { PlanShareToGroupSheet } from '@/components/plans/PlanShareToGroupSheet';
import {
  cancelActivePlan,
  getActivePlan,
  getCompletedPlanDays,
  getCompletedPlanIds,
  getPlanDay,
  isPlanDayUnlocked,
  markPlanDayCompleted,
  setActivePlan,
  setPlanDay,
  tryAutoCompletePlan,
  advancePlanDay,
  restartPlan,
  type ActivePlan,
} from '@/lib/plan_progress';
import { loadPlanSchedule, planCompletionPct, type PlanDayScheduleItem } from '@/lib/plan_schedule';
import { logPrayer } from '@/lib/reading';
import { buildPlanReadingMeta, readerHref } from '@/lib/plan_reading';
import { getPlanSession } from '@/lib/plan_session';
import { sessionProgress } from '@/lib/plan_steps';
import { LIFE_TOPICS } from '@/lib/discover_topics';

function groupPlans(plans: PlanSummary[]) {
  const groups = [
    { label: '7 天入门', items: plans.filter((p) => p.days <= 7) },
    { label: '15–30 天', items: plans.filter((p) => p.days > 7 && p.days <= 30) },
    { label: '长期通读', items: plans.filter((p) => p.days > 30) },
  ];
  return groups.filter((g) => g.items.length > 0);
}

const MICRO_TOPIC_PLANS = LIFE_TOPICS.filter((t) => t.microPlanId).map((t) => ({
  planId: t.microPlanId!,
  title: `「${t.title}」微${t.microPlanId!.startsWith('prayer_') ? '祷告' : '读经'}`,
  days: t.microPlanDays ?? 7,
  kind: (t.microPlanId!.startsWith('prayer_') ? 'prayer' : 'reading') as 'prayer' | 'reading',
  topicId: t.id,
}));

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
  const [showGenerate, setShowGenerate] = useState(false);
  const [tab, setTab] = useState<'reading' | 'prayer'>('reading');
  const [listTab, setListTab] = useState<'featured' | 'custom' | 'completed'>('featured');
  const [active, setActive] = useState<ActivePlan | null>(null);
  const [savedPlans, setSavedPlans] = useState<GeneratedPlan[]>([]);
  const [prayerSheet, setPrayerSheet] = useState<Awaited<ReturnType<typeof api.prayerToday>> | null>(null);
  const [toast, setToast] = useState('');
  const [schedulePlan, setSchedulePlan] = useState<ActivePlan | null>(null);
  const [scheduleItems, setScheduleItems] = useState<PlanDayScheduleItem[]>([]);
  const [scheduleBusyDay, setScheduleBusyDay] = useState<number | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [sharePlan, setSharePlan] = useState<{ planId: string; title: string } | null>(null);

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
    setSavedPlans(loadGeneratedPlans());
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('tab') === 'prayer') setTab('prayer');
    const list = params.get('tab');
    if (list === 'custom' || list === 'completed' || list === 'featured') {
      setListTab(list);
    }
    if (params.get('generate') === '1') {
      setListTab('custom');
      setShowGenerate(true);
    }
    const startId = params.get('start');
    if (startId) {
      setListTab('featured');
      const micro = MICRO_TOPIC_PLANS.find((m) => m.planId === startId);
      if (micro) {
        setTab(micro.kind === 'prayer' ? 'prayer' : 'reading');
      }
    }
  }, []);

  const featured = useMemo(
    () => plans.filter((p) => (tab === 'prayer' ? p.type === 'prayer' : p.type !== 'prayer')),
    [plans, tab],
  );

  const grouped = useMemo(() => groupPlans(featured), [featured]);

  const completedPlans = useMemo(() => {
    const items: ActivePlan[] = [];
    for (const id of getCompletedPlanIds()) {
      const fromFeatured = plans.find((p) => p.plan_id === id);
      if (fromFeatured) {
        items.push(toActivePlan(
          { planId: fromFeatured.plan_id, title: fromFeatured.title, type: fromFeatured.type, days: fromFeatured.days },
          'featured',
        ));
        continue;
      }
      const fromSaved = savedPlans.find((p) => p.id === id);
      if (fromSaved) {
        items.push(toActivePlan(
          { id: fromSaved.id, title: fromSaved.title, days_count: fromSaved.days_count },
          'generated',
        ));
      }
    }
    return items;
  }, [plans, savedPlans, active]);

  const handleRestartPlan = (ap: ActivePlan) => {
    restartPlan(ap.planId);
    setActivePlan(ap);
    setActive(ap);
    flashToast('已重置进度，可重新开始');
    void openSchedule(ap);
  };

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
    const highlight = params.get('highlight') ?? params.get('start');
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

  const openCustomize = () => {
    setListTab('custom');
    setShowGenerate(true);
  };

  const handleGeneratedSaved = (plan: GeneratedPlan, mode: 'start' | 'save') => {
    setSavedPlans(loadGeneratedPlans());
    setListTab('custom');
    if (mode === 'start') {
      const ap = toActivePlan({ id: plan.id, title: plan.title, days_count: plan.days_count }, 'generated');
      startPlan({ id: plan.id, title: plan.title, days_count: plan.days_count }, 'generated');
      void openSchedule(ap);
    } else {
      flashToast('已保存到「我的定制」');
    }
  };

  const deleteCustomPlan = (planId: string) => {
    if (!window.confirm('确定删除这个定制计划？进度将一并清除。')) return;
    removeGeneratedPlan(planId);
    setSavedPlans(loadGeneratedPlans());
    if (active?.planId === planId) {
      cancelActivePlan();
      setActive(null);
    }
    flashToast('已删除');
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
        <button type="button" className="text-link plans-customize-btn" onClick={openCustomize}>个性定制</button>
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
              <div className="plan-active-share-row">
                <button
                  type="button"
                  className="font-pill"
                  onClick={() => setSharePlan({ planId: active.planId, title: active.title })}
                >
                  分享到群
                </button>
                <button
                  type="button"
                  className="font-pill plan-invite-btn"
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
                  新建共读群
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mode-row" style={{ marginBottom: 8 }}>
        <button type="button" className={`mode-chip ${listTab === 'featured' ? 'mode-chip-active' : ''}`} onClick={() => setListTab('featured')}>热门</button>
        <button type="button" className={`mode-chip ${listTab === 'custom' ? 'mode-chip-active' : ''}`} onClick={() => setListTab('custom')}>我的定制</button>
        <button type="button" className={`mode-chip ${listTab === 'completed' ? 'mode-chip-active' : ''}`} onClick={() => setListTab('completed')}>已完成</button>
      </div>

      {listTab === 'featured' && (
        <div className="mode-row" style={{ marginBottom: 12 }}>
          <button type="button" className={`mode-chip ${tab === 'reading' ? 'mode-chip-active' : ''}`} onClick={() => setTab('reading')}>读经计划</button>
          <button type="button" className={`mode-chip ${tab === 'prayer' ? 'mode-chip-active' : ''}`} onClick={() => setTab('prayer')}>祷告计划</button>
        </div>
      )}

      {listTab === 'featured' && (
        <>
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

      {listTab === 'featured' && MICRO_TOPIC_PLANS.length > 0 && (
        <section style={{ marginBottom: 16 }}>
          <p className="plan-section-label">主题微计划 · 微祷告</p>
          <PlanCategoryGrid
            items={MICRO_TOPIC_PLANS.filter((m) =>
              tab === 'prayer' ? m.kind === 'prayer' : m.kind === 'reading',
            ).map((m) => ({
              id: m.planId,
              title: m.title,
              days: m.days,
              kind: m.kind,
              onClick: () => {
                const featuredPlan = plans.find((p) => p.plan_id === m.planId);
                if (featuredPlan) {
                  void openSchedule(toActivePlan(
                    { planId: featuredPlan.plan_id, title: featuredPlan.title, type: featuredPlan.type, days: featuredPlan.days },
                    'featured',
                  ));
                }
              },
            }))}
          />
        </section>
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
        </>
      )}

      {listTab === 'custom' && (
        <>
          <div className="plans-section-head">
            <h3>我的定制</h3>
            <span>{savedPlans.length} 个</span>
          </div>
          {savedPlans.length === 0 ? (
            <div className="card card-2 plan-custom-empty" style={{ marginBottom: 12 }}>
              <strong>创建你的专属读经计划</strong>
              <p className="muted" style={{ margin: '8px 0 0', lineHeight: 1.55 }}>
                选范围、定天数，系统自动排好每日章节。保存后可单独管理、分享到共读群。
              </p>
              <button type="button" className="btn" style={{ marginTop: 14, width: '100%' }} onClick={openCustomize}>
                开始定制
              </button>
            </div>
          ) : (
            <div className="plan-custom-list">
              {savedPlans.map((p) => (
                <PlanCustomCard
                  key={p.id}
                  plan={p}
                  isActive={active?.planId === p.id}
                  onContinue={() => void openSchedule(toActivePlan(
                    { id: p.id, title: p.title, days_count: p.days_count },
                    'generated',
                  ))}
                  onShare={() => setSharePlan({ planId: p.id, title: p.title })}
                  onDelete={() => deleteCustomPlan(p.id)}
                />
              ))}
              <button type="button" className="text-link plan-custom-add" onClick={openCustomize}>
                + 再定制一个计划
              </button>
            </div>
          )}
        </>
      )}

      {listTab === 'completed' && (
        <>
          <div className="plans-section-head">
            <h3>已完成</h3>
            <span>{completedPlans.length} 个</span>
          </div>
          {completedPlans.length === 0 ? (
            <p className="muted" style={{ marginBottom: 12 }}>完成计划后会出现在这里，可随时查看日程或重新开始。</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {completedPlans.map((p) => (
                <div key={p.planId} className="card card-2 plan-completed-card">
                  <strong>{p.title}</strong>
                  <p className="muted" style={{ fontSize: 12, margin: '4px 0 10px' }}>
                    {p.kind === 'prayer' ? '祷告' : '读经'} · {p.days} 天 · 已全部完成
                  </p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" className="font-pill" onClick={() => void openSchedule(p)}>
                      查看日程
                    </button>
                    <button type="button" className="font-pill accent" onClick={() => handleRestartPlan(p)}>
                      再读一遍
                    </button>
                    {p.kind !== 'prayer' && (
                      <button type="button" className="font-pill" onClick={() => setSharePlan({ planId: p.planId, title: p.title })}>
                        分享到群
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
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

      <PlanGenerateSheet
        open={showGenerate}
        scopes={scopes}
        onClose={() => setShowGenerate(false)}
        onSaved={handleGeneratedSaved}
      />

      {sharePlan && (
        <PlanShareToGroupSheet
          open
          planId={sharePlan.planId}
          planTitle={sharePlan.title}
          onClose={() => setSharePlan(null)}
          onBound={() => {
            flashToast('已绑定到共读群');
            setSharePlan(null);
          }}
        />
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
