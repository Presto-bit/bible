'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import PageBackBar, { SheetCloseButton } from '@/components/PageBackBar';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';
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
  getCachedPlanMeta,
  getCompletedPlanDays,
  getCompletedPlanIds,
  getPlanDay,
  getSkippedPlanDays,
  isPlanDayUnlocked,
  isPlanFullyCompleted,
  markPlanDayCompleted,
  planCompletionStreak,
  setActivePlan,
  setPlanDay,
  skipPlanDay,
  tryAutoCompletePlan,
  advancePlanDay,
  restartPlan,
  type ActivePlan,
} from '@/lib/plan_progress';
import { loadPlanSchedule, planCompletionPct, type PlanDayScheduleItem } from '@/lib/plan_schedule';
import { enqueuePlanProgress } from '@/lib/plan_sync';
import type { PlanScheduleMode } from '@/components/plans/PlanScheduleSheet';
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

function buildPlanIntro(plan: ActivePlan, items: PlanDayScheduleItem[]): string {
  const kind = plan.kind === 'prayer' ? '祷告' : '读经';
  const head = `共 ${plan.days} 天${kind}计划，按日推进，适合想建立稳定节奏的你。`;
  const sample = items.slice(0, 3);
  if (!sample.length) return head;
  const lines = sample.map((d) => `第 ${d.day} 天：${d.detail || d.title}`).join('；');
  return `${head}前几天：${lines}。`;
}

function planIsCompleted(plan: ActivePlan): boolean {
  return getCompletedPlanIds().includes(plan.planId)
    || isPlanFullyCompleted(plan.planId, plan.days);
}

export default function PlansPage() {
  useEdgeSwipeBack({ href: '/' });

  const [plans, setPlans] = useState<PlanSummary[]>([]);
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
  const [scheduleMode, setScheduleMode] = useState<PlanScheduleMode>('preview');
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
    api.plans()
      .then((p) => {
        setPlans(p.plans);
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
      if (startId.startsWith('prayer_')) setTab('prayer');
      else setTab('reading');
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

  const [activeProgress, setActiveProgress] = useState<string | null>(null);
  const openHandledRef = useRef(false);
  const startHandledRef = useRef(false);
  const activeDay = active ? getPlanDay(active.planId) || 1 : 0;
  const activeCompletedDays = active ? getCompletedPlanDays(active.planId).length : 0;
  const activeSkippedDays = active ? getSkippedPlanDays(active.planId) : [];
  const activeDoneSet = active ? new Set(getCompletedPlanDays(active.planId)) : new Set<number>();
  const activeSkippedSet = new Set(activeSkippedDays);
  const activeStreak = active ? planCompletionStreak(active.planId) : 0;
  const activePct = active ? planCompletionPct(active.planId, active.days) : 0;

  const resolvePlanById = useCallback((planId: string): ActivePlan | null => {
    const current = getActivePlan();
    if (current?.planId === planId) return current;
    const fromFeatured = plans.find((p) => p.plan_id === planId);
    if (fromFeatured) {
      return toActivePlan(
        { planId: fromFeatured.plan_id, title: fromFeatured.title, type: fromFeatured.type, days: fromFeatured.days },
        'featured',
      );
    }
    const fromSaved = savedPlans.find((p) => p.id === planId);
    if (fromSaved) {
      return toActivePlan(
        { id: fromSaved.id, title: fromSaved.title, days_count: fromSaved.days_count },
        'generated',
      );
    }
    return getCachedPlanMeta(planId);
  }, [plans, savedPlans]);

  const loadScheduleSheet = useCallback(async (ap: ActivePlan, mode: PlanScheduleMode) => {
    setSchedulePlan(ap);
    setScheduleMode(mode);
    setScheduleLoading(true);
    setScheduleItems([]);
    try {
      setScheduleItems(await loadPlanSchedule(ap));
    } catch (e) {
      flashToast(String(e));
      setSchedulePlan(null);
    } finally {
      setScheduleLoading(false);
    }
  }, []);

  /** 仅预览：不写入进行中计划 */
  const openPreview = useCallback(async (ap: ActivePlan) => {
    await loadScheduleSheet(ap, 'preview');
  }, [loadScheduleSheet]);

  const previewPlanDay = useCallback(async (ap: ActivePlan, day: number) => {
    if (ap.kind === 'prayer') {
      try {
        setPrayerSheet(await api.prayerToday(ap.planId, day));
      } catch (e) {
        flashToast(`祷告内容加载失败：${e}`);
      }
      return;
    }
    try {
      const meta = await buildPlanReadingMeta(ap, day);
      if (meta) window.location.href = readerHref(meta);
      else flashToast('该日暂无读经内容');
    } catch (e) {
      flashToast(String(e));
    }
  }, []);

  /** 管理日程：仅当前进行中计划 */
  const openManageSchedule = useCallback(async (ap: ActivePlan) => {
    const current = getActivePlan();
    if (current?.planId !== ap.planId) {
      await openPreview(ap);
      return;
    }
    if (tryAutoCompletePlan(ap.planId, ap.days)) {
      setActive(null);
      flashToast('计划已全部完成 🎉');
      return;
    }
    await loadScheduleSheet(ap, 'manage');
  }, [loadScheduleSheet, openPreview]);

  const goReadPlan = useCallback(async (plan: ActivePlan, day: number) => {
    setActivePlan(plan);
    setPlanDay(plan.planId, day);
    setActive(plan);
    if (plan.kind === 'prayer') {
      try {
        setPrayerSheet(await api.prayerToday(plan.planId, day));
      } catch (e) {
        flashToast(`祷告内容加载失败：${e}`);
      }
      return;
    }
    try {
      const meta = await buildPlanReadingMeta(plan, day);
      if (meta) window.location.href = readerHref(meta);
      else flashToast('今日计划暂无内容，请换一天或重新选择计划');
    } catch (e) {
      flashToast(String(e));
    }
  }, []);

  const goToday = useCallback(async (plan: ActivePlan) => {
    const day = getPlanDay(plan.planId) || 1;
    await goReadPlan(plan, day);
  }, [goReadPlan]);

  /** 明确采纳为进行中计划，默认进入今日 */
  const adoptPlan = useCallback(async (
    plan: ActivePlan,
    opts?: { restart?: boolean; startToday?: boolean },
  ) => {
    const current = getActivePlan();
    if (current && current.planId !== plan.planId) {
      const ok = window.confirm(
        `将结束「${current.title}」（进度仍保留，可稍后继续），开始「${plan.title}」。确定？`,
      );
      if (!ok) return;
    }
    if (opts?.restart) {
      restartPlan(plan.planId);
    }
    setActivePlan(plan);
    if (getPlanDay(plan.planId) === 0 || opts?.restart) {
      setPlanDay(plan.planId, 1);
    }
    setActive(plan);
    const day = getPlanDay(plan.planId) || 1;
    enqueuePlanProgress(plan.planId, day, 'active');
    setSchedulePlan(null);
    flashToast(opts?.restart ? '已重置并从第 1 天开始' : '已设为进行中的计划');
    if (opts?.startToday === false) {
      await openManageSchedule(plan);
      return;
    }
    await goReadPlan(plan, day);
  }, [goReadPlan, openManageSchedule]);

  const handleRestartPlan = (ap: ActivePlan) => {
    if (!window.confirm(`将重置「${ap.title}」的进度并从第 1 天开始。确定？`)) return;
    void adoptPlan(ap, { restart: true });
  };

  const handleScheduleDay = async (day: number) => {
    if (!schedulePlan || scheduleMode !== 'manage') return;
    const item = scheduleItems.find((d) => d.day === day);
    if (!isPlanDayUnlocked(schedulePlan.planId, day) && !item?.completed && !item?.skipped) {
      flashToast(day > 1 ? `请先完成或跳过第 ${day - 1} 天` : '该日尚未解锁');
      return;
    }
    setScheduleBusyDay(day);
    setSchedulePlan(null);
    await goReadPlan(schedulePlan, day);
    setScheduleBusyDay(null);
  };

  const handleSkipDay = async (day: number) => {
    if (!schedulePlan || scheduleMode !== 'manage') return;
    if (!isPlanDayUnlocked(schedulePlan.planId, day)) {
      flashToast('该日尚未解锁');
      return;
    }
    skipPlanDay(schedulePlan.planId, day, schedulePlan.days);
    const nextDay = getPlanDay(schedulePlan.planId) || day + 1;
    enqueuePlanProgress(schedulePlan.planId, nextDay, 'active');
    setActive({ ...schedulePlan });
    try {
      setScheduleItems(await loadPlanSchedule(schedulePlan));
    } catch {
      /* ignore */
    }
    flashToast(`已跳过第 ${day} 天，可随时补读`);
  };

  const previewPrimary = useMemo(() => {
    if (!schedulePlan || scheduleMode !== 'preview') return null;
    const current = active;
    if (current?.planId === schedulePlan.planId) {
      return {
        label: schedulePlan.kind === 'prayer' ? '今日祷告 ›' : '今日继续 ›',
        run: () => {
          setSchedulePlan(null);
          void goToday(schedulePlan);
        },
      };
    }
    if (planIsCompleted(schedulePlan)) {
      return {
        label: '再读一遍',
        run: () => {
          if (!window.confirm(`将重置「${schedulePlan.title}」的进度并从第 1 天开始。确定？`)) return;
          void adoptPlan(schedulePlan, { restart: true });
        },
      };
    }
    if (current) {
      return {
        label: '换成这个计划',
        run: () => void adoptPlan(schedulePlan),
      };
    }
    return {
      label: '设为我的计划并开始',
      run: () => void adoptPlan(schedulePlan),
    };
  }, [schedulePlan, scheduleMode, active, adoptPlan, goToday]);

  const previewSecondary = useMemo(() => {
    if (!schedulePlan || scheduleMode !== 'preview') return null;
    const current = active;
    if (current?.planId === schedulePlan.planId) {
      return {
        label: '管理日程',
        run: () => setScheduleMode('manage'),
      };
    }
    if (current) {
      return {
        label: '继续当前计划',
        run: () => setSchedulePlan(null),
      };
    }
    return {
      label: '再看看',
      run: () => setSchedulePlan(null),
    };
  }, [schedulePlan, scheduleMode, active]);

  useEffect(() => {
    if (startHandledRef.current || loading) return;
    const params = new URLSearchParams(window.location.search);
    const highlight = params.get('highlight') ?? params.get('start');
    if (!highlight) return;
    startHandledRef.current = true;
    const fromFeatured = plans.find((p) => p.plan_id === highlight);
    if (fromFeatured) {
      void openPreview(toActivePlan(
        { planId: fromFeatured.plan_id, title: fromFeatured.title, type: fromFeatured.type, days: fromFeatured.days },
        'featured',
      ));
      return;
    }
    const fromSaved = savedPlans.find((p) => p.id === highlight);
    if (fromSaved) {
      void openPreview(toActivePlan(
        { id: fromSaved.id, title: fromSaved.title, days_count: fromSaved.days_count },
        'generated',
      ));
    }
  }, [loading, plans, savedPlans, openPreview]);

  useEffect(() => {
    if (openHandledRef.current || loading) return;
    const params = new URLSearchParams(window.location.search);
    const openId = params.get('open');
    if (!openId) return;
    openHandledRef.current = true;
    const dayParam = params.get('day');
    const day = dayParam
      ? Math.max(1, Number(dayParam) || 1)
      : (getPlanDay(openId) || 1);
    const plan = resolvePlanById(openId);
    const url = new URL(window.location.href);
    url.searchParams.delete('open');
    url.searchParams.delete('day');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    if (!plan) {
      flashToast('找不到该计划');
      return;
    }
    const current = getActivePlan();
    if (current?.planId === plan.planId) {
      void goReadPlan(plan, day);
      return;
    }
    void openPreview(plan);
  }, [loading, resolvePlanById, goReadPlan, openPreview]);

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
    const ap = toActivePlan({ id: plan.id, title: plan.title, days_count: plan.days_count }, 'generated');
    if (mode === 'start') {
      void adoptPlan(ap);
    } else {
      flashToast('已保存到「我的定制」');
      void openPreview(ap);
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

  const cancelPlan = () => {
    if (!window.confirm('结束进行中的计划？进度会保留，之后仍可从列表继续。')) return;
    cancelActivePlan();
    setActive(null);
    flashToast('已结束进行中');
  };

  return (
    <main className="container">
      <header className="page-head plans-page-head">
        <PageBackBar href="/" label="首页" />
        <h2 className="page-head-title">读经计划</h2>
        <button type="button" className="text-link plans-customize-btn" onClick={openCustomize}>个性定制</button>
      </header>

      {active && (
        <div className="card card-tint plan-active-compact">
          <div className="plan-active-top">
            <span className="plan-active-label">进行中的计划</span>
            <button type="button" className="text-link" style={{ fontSize: 12 }} onClick={cancelPlan}>结束进行中</button>
          </div>
          <strong className="plan-active-title">{active.title}</strong>
          <p className="plan-active-meta plan-active-meta-block">
            {active.kind === 'prayer' ? '祷告' : '读经'}
            {' · '}第 {activeDay} 天
            {' · '}已完成 {activeCompletedDays}/{active.days} 天
            {activeStreak >= 2 ? ` · 连续 ${activeStreak} 天` : ''}
            {activeSkippedDays.length > 0 ? ` · 跳过 ${activeSkippedDays.length} 天` : ''}
            {activeProgress ? ` · ${activeProgress}` : ''}
          </p>
          <div
            className="plan-day-dots"
            aria-label={`进度 ${activeCompletedDays}/${active.days}`}
          >
            {Array.from({ length: active.days }, (_, i) => {
              const d = i + 1;
              let cls = 'plan-day-dot';
              if (activeDoneSet.has(d)) cls += ' done';
              else if (activeSkippedSet.has(d)) cls += ' skipped';
              else if (d === activeDay) cls += ' current';
              return <span key={d} className={cls} title={`第 ${d} 天`} />;
            })}
          </div>
          <div className="plan-progress-bar plan-active-bar">
            <div className="plan-progress-fill" style={{ width: `${activePct}%` }} />
          </div>
          <div className="plan-active-actions">
            <button type="button" className="btn plan-active-today-btn" onClick={() => void goToday(active)}>
              {active.kind === 'prayer' ? '今日祷告' : '今日继续'} ›
            </button>
            <button
              type="button"
              className="text-link"
              style={{ fontSize: 13, whiteSpace: 'nowrap' }}
              onClick={() => void openManageSchedule(active)}
            >
              日程表
            </button>
          </div>
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

      {grouped.map((group) => (
        <section key={group.label}>
          <p className="plan-section-label">{group.label}</p>
          <PlanCategoryGrid
            items={group.items.map((p) => ({
              id: p.plan_id,
              title: p.title,
              days: p.days,
              kind: p.type === 'prayer' ? 'prayer' : 'reading',
              isActive: active?.planId === p.plan_id,
              onClick: () => void openPreview(toActivePlan(
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
                  onContinue={() => {
                    const ap = toActivePlan(
                      { id: p.id, title: p.title, days_count: p.days_count },
                      'generated',
                    );
                    void goToday(ap);
                  }}
                  onPreview={() => void openPreview(toActivePlan(
                    { id: p.id, title: p.title, days_count: p.days_count },
                    'generated',
                  ))}
                  onManage={() => void openManageSchedule(toActivePlan(
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
                    <button type="button" className="font-pill" onClick={() => void openPreview(p)}>
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
            mode={scheduleMode}
            intro={scheduleMode === 'preview' ? buildPlanIntro(schedulePlan, scheduleItems) : undefined}
            busyDay={scheduleBusyDay}
            currentDay={getPlanDay(schedulePlan.planId) || 1}
            primaryLabel={scheduleMode === 'preview' ? previewPrimary?.label : undefined}
            secondaryLabel={scheduleMode === 'preview' ? previewSecondary?.label : undefined}
            onPrimary={scheduleMode === 'preview' ? previewPrimary?.run : undefined}
            onSecondary={scheduleMode === 'preview' ? previewSecondary?.run : undefined}
            onClose={() => setSchedulePlan(null)}
            onStartDay={
              scheduleMode === 'manage'
                ? handleScheduleDay
                : scheduleMode === 'preview'
                  ? (day) => void previewPlanDay(schedulePlan, day)
                  : undefined
            }
            onSkipDay={scheduleMode === 'manage' ? (day) => void handleSkipDay(day) : undefined}
          />
        )
      )}

      <PlanGenerateSheet
        open={showGenerate}
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
              <SheetCloseButton onClick={() => setPrayerSheet(null)} />
            </div>
            <p className="muted" style={{ fontSize: 12, margin: '0 0 8px' }}>
              {prayerSheet.plan_title ?? '祷告计划'}
              {prayerSheet.day != null ? ` · 第 ${prayerSheet.day} 天` : ''}
            </p>
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
                  enqueuePlanProgress(activePrayer.planId, day, 'done');
                  advancePlanDay(activePrayer.planId, activePrayer.days);
                  if (tryAutoCompletePlan(activePrayer.planId, activePrayer.days)) {
                    setActive(null);
                    flashToast('计划已全部完成 🎉');
                  } else {
                    const nextDay = getPlanDay(activePrayer.planId) || day + 1;
                    enqueuePlanProgress(activePrayer.planId, nextDay, 'active');
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
