'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type TouchEvent } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api, type OpsCampaignDetail, type OpsCampaignLanding } from '@/lib/api';
import {
  clearCampaignDraft,
  loadCampaignDraft,
  saveCampaignDraft,
} from '@/lib/campaign_draft';
import {
  buildPublishChecklist,
  CAMPAIGN_CONFIG_SECTIONS,
  campaignPreviewUrl,
  campaignSectionDone,
  campaignStatusLabel,
  campaignStatusTone,
  copyText,
  firstIncompleteSection,
  type CampaignConfigSectionId,
} from '@/lib/campaign_ops';
import { getReadingExample, hasReadingExample } from '@/lib/campaign_example_copy';
import { fetchAdminEligible } from '@/lib/admin_rag';
import { resolvePrimaryCta } from '@/lib/campaign_nav';
import { ensureLandingBlocks } from '@/lib/campaign_blocks';
import { CampaignAdminGate } from '@/components/campaigns/CampaignAdminGate';
import { CampaignBlockEditor } from '@/components/campaigns/CampaignBlockEditor';
import { CampaignLivePreview } from '@/components/campaigns/CampaignLivePreview';
import { OpsPcShell } from '@/components/campaigns/OpsPcShell';

function toLocalInput(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

export default function CampaignEditPage() {
  return (
    <CampaignAdminGate>
      <CampaignEditInner />
    </CampaignAdminGate>
  );
}

function CampaignEditInner() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id || '');
  const [camp, setCamp] = useState<OpsCampaignDetail | null>(null);
  const [groups, setGroups] = useState<Array<{ id: string; name: string; role: string }>>([]);
  const [name, setName] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [status, setStatus] = useState('draft');
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [railSlot, setRailSlot] = useState(1);
  const [railEnabled, setRailEnabled] = useState(true);
  const [railHref, setRailHref] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [landing, setLanding] = useState<OpsCampaignLanding>({});
  const [err, setErr] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const skipDraftOnce = useRef(true);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [audienceMode, setAudienceMode] = useState<'groups' | 'all' | 'admin_preview'>('groups');
  const [activeSection, setActiveSection] = useState<CampaignConfigSectionId>('basic');
  const [openSections, setOpenSections] = useState<Record<CampaignConfigSectionId, boolean>>({
    basic: true,
    content: true,
    audience: true,
    exposure: true,
  });
  const pinnedOpen = useRef<Partial<Record<CampaignConfigSectionId, boolean>>>({});
  /** 顶部三 Tab：空间（控件库）| 配置 | 设置 */
  const [leftTab, setLeftTab] = useState<'palette' | 'config' | 'settings'>('palette');
  const tabSwipeX = useRef<number | null>(null);

  const checklistInput = useMemo(
    () => ({
      name,
      templateId: camp?.templateId || '',
      groupIds,
      landing: { ...landing, title: name.trim() || landing.title },
      railEnabled,
      railSlot,
      audienceMode,
      isPlatformAdmin,
      startAt,
      endAt,
    }),
    [
      name,
      camp?.templateId,
      groupIds,
      landing,
      railEnabled,
      railSlot,
      audienceMode,
      isPlatformAdmin,
      startAt,
      endAt,
    ],
  );

  const checklist = useMemo(() => buildPublishChecklist(checklistInput), [checklistInput]);

  const sectionDone = useMemo(() => {
    const map = {} as Record<CampaignConfigSectionId, boolean>;
    for (const s of CAMPAIGN_CONFIG_SECTIONS) {
      map[s.id] = campaignSectionDone(s.id, checklistInput);
    }
    return map;
  }, [checklistInput]);

  const doneCount = useMemo(
    () => CAMPAIGN_CONFIG_SECTIONS.filter((s) => sectionDone[s.id]).length,
    [sectionDone],
  );

  useEffect(() => {
    setOpenSections((prev) => {
      const next = { ...prev };
      for (const s of CAMPAIGN_CONFIG_SECTIONS) {
        if (sectionDone[s.id]) {
          if (!pinnedOpen.current[s.id]) next[s.id] = false;
        } else {
          next[s.id] = true;
        }
      }
      return next;
    });
  }, [sectionDone]);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const [res, g, adminOk] = await Promise.all([
        api.getCampaign(id, true),
        api.campaignStaffGroups(),
        fetchAdminEligible().catch(() => false),
      ]);
      setIsPlatformAdmin(Boolean(adminOk));
      if (!res.campaign) {
        setErr(res.message || '无法加载活动');
        return;
      }
      const campaign = res.campaign;
      setCamp(campaign);
      const available = g.groups || [];
      setGroups(available);
      const allowed = new Set(available.map((x) => x.id));
      const savedIds = (campaign.groupIds || []).filter((id) => allowed.has(id));
      setName(campaign.name);
      setSubtitle(campaign.subtitle || '');
      setStatus(campaign.status);
      setGroupIds(savedIds);
      setRailSlot(campaign.railSlot || 1);
      setRailEnabled(campaign.railEnabled !== false);
      setRailHref(campaign.railHref || '');
      setStartAt(toLocalInput(campaign.startAt));
      setEndAt(toLocalInput(campaign.endAt));
      setAudienceMode(
        (campaign.audienceMode as 'groups' | 'all' | 'admin_preview') || 'groups',
      );
      const draft = loadCampaignDraft(id);
      const draftNewer =
        Boolean(draft?.savedAt) &&
        (!campaign.updatedAt ||
          new Date(draft!.savedAt).getTime() > new Date(campaign.updatedAt).getTime());
      if (draftNewer && window.confirm('发现本地未同步草稿，是否恢复？')) {
        setName(draft!.name);
        setSubtitle(draft!.subtitle);
        setStatus(draft!.status);
        setGroupIds((draft!.groupIds || []).filter((id) => allowed.has(id)));
        if (draft!.audienceMode) setAudienceMode(draft!.audienceMode);
        setRailSlot(draft!.railSlot);
        setRailEnabled(draft!.railEnabled);
        setRailHref(draft!.railHref || '');
        setStartAt(draft!.startAt);
        setEndAt(draft!.endAt);
        setLanding(ensureLandingBlocks(draft!.landing || {}, campaign.templateId));
        setHint('已恢复本地草稿');
      } else {
        setLanding(ensureLandingBlocks(campaign.landing || {}, campaign.templateId));
      }
      skipDraftOnce.current = true;
      setDraftReady(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '加载失败');
    }
  }, [id]);

  useEffect(() => {
    if (id) void load();
  }, [id, load]);

  useEffect(() => {
    if (!draftReady || !id) return;
    if (skipDraftOnce.current) {
      skipDraftOnce.current = false;
      return;
    }
    const t = window.setTimeout(() => {
      saveCampaignDraft(id, {
        name,
        subtitle,
        status,
        groupIds,
        audienceMode,
        railSlot,
        railEnabled,
        railHref,
        startAt,
        endAt,
        landing,
      });
    }, 800);
    return () => window.clearTimeout(t);
  }, [
    draftReady,
    id,
    name,
    subtitle,
    status,
    groupIds,
    audienceMode,
    railSlot,
    railEnabled,
    railHref,
    startAt,
    endAt,
    landing,
  ]);

  const scrollTo = (anchor: string) => {
    document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const jumpToSection = (sid: CampaignConfigSectionId, anchor: string) => {
    pinnedOpen.current[sid] = true;
    setOpenSections((prev) => ({ ...prev, [sid]: true }));
    setActiveSection(sid);
    if (sid === 'content') {
      setLeftTab('palette');
    } else {
      setLeftTab('settings');
      window.setTimeout(() => scrollTo(anchor), 60);
    }
  };

  const openLeftTab = (tab: 'palette' | 'config' | 'settings') => {
    setLeftTab(tab);
    if (tab === 'settings') {
      setActiveSection((prev) => (prev === 'content' ? 'basic' : prev));
    } else {
      setActiveSection('content');
    }
  };

  const onTabSwipeStart = (e: TouchEvent) => {
    tabSwipeX.current = e.changedTouches[0]?.clientX ?? null;
  };

  const onTabSwipeEnd = (e: TouchEvent) => {
    const start = tabSwipeX.current;
    tabSwipeX.current = null;
    if (start == null) return;
    const end = e.changedTouches[0]?.clientX;
    if (end == null) return;
    const dx = end - start;
    if (Math.abs(dx) < 56) return;
    const order: Array<'palette' | 'config' | 'settings'> = ['palette', 'config', 'settings'];
    const idx = order.indexOf(leftTab);
    if (idx < 0) return;
    if (dx < 0 && idx < order.length - 1) openLeftTab(order[idx + 1]!);
    if (dx > 0 && idx > 0) openLeftTab(order[idx - 1]!);
  };

  const toggleSection = (sid: CampaignConfigSectionId) => {
    setOpenSections((prev) => {
      const nextOpen = !prev[sid];
      pinnedOpen.current[sid] = nextOpen;
      return { ...prev, [sid]: nextOpen };
    });
  };

  const toggleGroup = (gid: string) => {
    setGroupIds((prev) => (prev.includes(gid) ? prev.filter((x) => x !== gid) : [...prev, gid]));
  };

  const save = async (nextStatus?: string) => {
    if (!camp) return;
    const target = nextStatus || status;
    if (target === 'published') {
      const errs = buildPublishChecklist(checklistInput);
      if (errs.length) {
        setErr(errs.join('；'));
        const incomplete = firstIncompleteSection(checklistInput);
        if (incomplete) jumpToSection(incomplete.id, incomplete.anchor);
        return;
      }
    }
    setBusy(true);
    setErr(null);
    try {
      const { campaign } = await api.updateCampaign(id, {
        name: name.trim(),
        templateId: camp.templateId,
        status: target,
        startAt: fromLocalInput(startAt),
        endAt: fromLocalInput(endAt),
        subtitle: subtitle.trim(),
        railSlot,
        railEnabled,
        railHref: railHref.trim(),
        groupIds: audienceMode === 'groups' ? groupIds : [],
        landing: {
          ...landing,
          title: name.trim() || landing.title,
          primaryCta: resolvePrimaryCta(camp.templateId, id, landing.primaryCta),
        },
        audienceMode: isPlatformAdmin ? audienceMode : 'groups',
        heroEnabled: false,
      });
      setCamp(campaign);
      setStatus(campaign.status);
      setAudienceMode((campaign.audienceMode as typeof audienceMode) || 'groups');
      setRailHref(campaign.railHref || '');
      setLanding(ensureLandingBlocks(campaign.landing || landing, campaign.templateId));
      clearCampaignDraft(id);
      skipDraftOnce.current = true;
      setHint('已保存');
      if (nextStatus === 'published') {
        router.push(`/campaigns/view/${id}?preview=1`);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };

  const saveAsTemplate = async () => {
    if (!camp) return;
    const tName = window.prompt('模板名称', `${name || camp.name} 模板`);
    if (!tName?.trim()) return;
    setBusy(true);
    try {
      await api.saveUserCampaignTemplate({
        name: tName.trim(),
        baseTemplateId: camp.templateId,
        landing: { ...landing, title: name.trim() || landing.title },
      });
      setHint('已保存到「我的模板」');
    } catch (e) {
      setErr(e instanceof Error ? e.message : '保存模板失败');
    } finally {
      setBusy(false);
    }
  };

  const extend = async () => {
    setBusy(true);
    try {
      const { campaign } = await api.extendCampaign(id, 7);
      setEndAt(toLocalInput(campaign.endAt));
      setStatus(campaign.status);
      setHint('已延期 7 天');
    } catch (e) {
      setErr(e instanceof Error ? e.message : '延期失败');
    } finally {
      setBusy(false);
    }
  };

  const copyCampaign = async () => {
    setBusy(true);
    try {
      const { campaign } = await api.copyCampaign(id);
      setHint('已复制为新草稿');
      router.push(`/campaigns/${campaign.id}/edit`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '复制失败');
      setBusy(false);
    }
  };

  const copyPreview = async () => {
    const ok = await copyText(campaignPreviewUrl(id));
    setHint(ok ? '预览链已复制' : '复制失败');
  };

  if (!camp && !err) {
    return (
      <main className="container">
        <p className="muted">加载中…</p>
      </main>
    );
  }

  if (!camp && err) {
    return (
      <main className="container ops-page">
        <Link href="/admin?tab=ops" className="ops-back">
          ← 活动运营
        </Link>
        <p className="ops-banner ops-banner-warn" style={{ color: 'var(--danger, #b00)' }}>
          {err}
        </p>
      </main>
    );
  }

  const resolvedCta = resolvePrimaryCta(camp?.templateId || '', id, landing.primaryCta);

  return (
    <OpsPcShell
      title={name.trim() || '编辑活动'}
      variant="edit"
      sub={
        camp ? (
          <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className={`ops-status ops-status-${campaignStatusTone(status)}`}>
              {campaignStatusLabel(status)}
            </span>
            <span>{camp.tag || '活动'}</span>
            <span>
              配置进度 {doneCount}/{CAMPAIGN_CONFIG_SECTIONS.length}
            </span>
            {hint ? <span>· {hint}</span> : null}
          </span>
        ) : null
      }
      actions={
        <>
          <button type="button" className="btn" disabled={busy} onClick={() => void save('draft')}>
            存草稿
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || checklist.length > 0}
            onClick={() => void save('published')}
          >
            发布
          </button>
        </>
      }
    >
      {err ? <p className="ops-banner ops-banner-warn" style={{ color: 'var(--danger, #b00)' }}>{err}</p> : null}

      <nav className="ops-canvas-tabs" aria-label="编辑分区">
        {(
          [
            ['palette', '空间'],
            ['config', '配置'],
            ['settings', '设置'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`ops-canvas-tab${leftTab === id ? ' is-on' : ''}`}
            onClick={() => openLeftTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      <div
        className={`ops-canvas-grid${leftTab === 'settings' ? ' is-settings-tab' : ''}`}
        onTouchStart={onTabSwipeStart}
        onTouchEnd={onTabSwipeEnd}
      >
        {leftTab === 'settings' ? (
          <div className="ops-canvas-settings" aria-label="页面设置">
            <div
              id="ops-sec-basic"
              className={`settings-card ops-sec${openSections.basic ? '' : ' is-collapsed'}`}
            >
              <button type="button" className="ops-sec-toggle" onClick={() => toggleSection('basic')}>
                <span className="settings-title" style={{ margin: 0 }}>
                  基本信息
                  {sectionDone.basic ? (
                    <span className="ops-sec-badge is-done">已完成</span>
                  ) : (
                    <span className="ops-sec-badge">待完善</span>
                  )}
                </span>
                <span className="muted">{openSections.basic ? '收起' : '展开'}</span>
              </button>
              <label className={`ops-field${!name.trim() ? ' is-required' : ''}`}>
                <span>
                  活动名称
                  {!name.trim() ? <span className="ops-req-tag">必填</span> : null}
                </span>
                <input
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={
                    hasReadingExample(camp?.templateId || '')
                      ? getReadingExample(camp!.templateId)?.suggestedName || '活动名称'
                      : '活动名称'
                  }
                />
              </label>
              <label className="ops-field" style={{ marginTop: 10 }}>
                <span>今日推荐副文案</span>
                <input
                  className="input"
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  placeholder="继续阅读"
                />
                <span className="muted" style={{ display: 'block', marginTop: 4, fontSize: 12 }}>
                  出现在主卡底部（原「继续阅读」位置）；留空则显示「继续阅读」
                </span>
              </label>
            </div>

            <div
              id="ops-sec-audience"
              className={`settings-card ops-sec${openSections.audience ? '' : ' is-collapsed'}`}
            >
              <button
                type="button"
                className="ops-sec-toggle"
                onClick={() => toggleSection('audience')}
              >
                <span className="settings-title" style={{ margin: 0 }}>
                  谁能看见
                  {sectionDone.audience ? (
                    <span className="ops-sec-badge is-done">已完成</span>
                  ) : (
                    <span className="ops-sec-badge">待完善</span>
                  )}
                </span>
                <span className="muted">{openSections.audience ? '收起' : '展开'}</span>
              </button>
              {isPlatformAdmin ? (
                <div className="ops-chip-row" style={{ marginTop: 0, marginBottom: 10 }}>
                  {(
                    [
                      ['groups', '指定群'],
                      ['all', '全站'],
                      ['admin_preview', '仅超管预览'],
                    ] as const
                  ).map(([k, label]) => (
                    <button
                      key={k}
                      type="button"
                      className={`ops-chip${audienceMode === k ? ' is-on' : ''}`}
                      onClick={() => setAudienceMode(k)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ) : null}
              {audienceMode === 'groups' ? (
                groups.length === 0 ? (
                  <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                    暂无可用群。仅展示你当前仍是群主/管理员的群。
                  </p>
                ) : (
                  <div className="ops-select-list">
                    {groups.map((g) => (
                      <label
                        key={g.id}
                        className={`card row-card home-list-row home-list-row-wrap profile-soft-row ops-select-row${
                          groupIds.includes(g.id) ? ' is-on' : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={groupIds.includes(g.id)}
                          onChange={() => toggleGroup(g.id)}
                          style={{ marginRight: 4 }}
                        />
                        <span className="home-list-main">
                          <strong>{g.name}</strong>
                          <span className="muted home-list-sub">
                            {g.role === 'owner' ? '群主' : '可选受众'}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                )
              ) : (
                <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                  {audienceMode === 'all'
                    ? '登录用户在活动时段内均可在今日推荐看到。'
                    : '仅超管预览可见，不会推给普通成员。'}
                </p>
              )}
            </div>

            <div
              id="ops-sec-exposure"
              className={`settings-card ops-sec${openSections.exposure ? '' : ' is-collapsed'}`}
            >
              <button
                type="button"
                className="ops-sec-toggle"
                onClick={() => toggleSection('exposure')}
              >
                <span className="settings-title" style={{ margin: 0 }}>
                  首页今日推荐
                  {sectionDone.exposure ? (
                    <span className="ops-sec-badge is-done">已完成</span>
                  ) : (
                    <span className="ops-sec-badge">待完善</span>
                  )}
                </span>
                <span className="muted">{openSections.exposure ? '收起' : '展开'}</span>
              </button>
              <label className="ops-check-row">
                <input
                  type="checkbox"
                  checked={railEnabled}
                  onChange={(e) => setRailEnabled(e.target.checked)}
                />
                出现在今日推荐
              </label>
              <div className="ops-chip-row" style={{ marginTop: 10 }}>
                {[1, 2, 3].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`ops-chip${railSlot === n ? ' is-on' : ''}`}
                    disabled={!railEnabled}
                    onClick={() => setRailSlot(n)}
                  >
                    第 {n} 位{n === 1 ? ' · 主卡' : ''}
                  </button>
                ))}
              </div>
              <label className="ops-field" style={{ marginTop: 12 }}>
                <span>卡片点击跳转</span>
                <input
                  className="input"
                  value={railHref}
                  disabled={!railEnabled}
                  onChange={(e) => setRailHref(e.target.value)}
                  placeholder="留空=活动落地页；创世记可填 https://genesis-50.pages.dev/?code=0CIW43NR"
                />
                <span className="muted" style={{ display: 'block', marginTop: 4, fontSize: 12 }}>
                  创世记 50 天链接会自动登录进入（无需填邀请码、无确认框）
                </span>
              </label>
              <div
                style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr', marginTop: 12 }}
              >
                <label className="ops-field">
                  <span>开始</span>
                  <input
                    className="input"
                    type="datetime-local"
                    value={startAt}
                    onChange={(e) => setStartAt(e.target.value)}
                  />
                </label>
                <label className="ops-field">
                  <span>结束</span>
                  <input
                    className="input"
                    type="datetime-local"
                    value={endAt}
                    onChange={(e) => setEndAt(e.target.value)}
                  />
                </label>
              </div>
            </div>

            {camp?.stats && status !== 'draft' ? (
              <div className="settings-card ops-sec" style={{ marginTop: 12 }}>
                <div className="ops-sec-toggle" style={{ cursor: 'default' }}>
                  <span className="settings-title" style={{ margin: 0 }}>
                    运营数据
                  </span>
                  <button
                    type="button"
                    className="text-link"
                    style={{ fontSize: 12 }}
                    onClick={() => void load()}
                  >
                    刷新
                  </button>
                </div>
                <div className="ops-stats-grid" style={{ marginTop: 10 }}>
                  {(
                    [
                      ['打开', camp.stats.opens],
                      ['已读', camp.stats.readers],
                      ['赞', camp.stats.likes],
                      ['RSVP', camp.stats.rsvps],
                      ['报名', camp.stats.signups ?? 0],
                      ['提问', camp.stats.questions ?? 0],
                    ] as const
                  ).map(([label, n]) => (
                    <div key={label} className="ops-stat">
                      <strong>{n ?? 0}</strong>
                      <span>{label}</span>
                    </div>
                  ))}
                </div>
                <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>
                  仅在此配置页与活动列表可见，成员从今日推荐进入时不会看到
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        <CampaignBlockEditor
          landing={landing}
          setLanding={setLanding}
          templateId={camp?.templateId || ''}
          campaignId={id}
          onHint={setHint}
          onError={setErr}
          layout="canvas"
          toolsTab={leftTab === 'config' ? 'config' : 'palette'}
          onToolsTabChange={(tab) => openLeftTab(tab)}
          hideTools={leftTab === 'settings'}
        />

        <div className="ops-canvas-preview">
          <CampaignLivePreview
            name={name}
            subtitle={subtitle}
            tag={camp?.tag || undefined}
            templateId={camp?.templateId || ''}
            campaignId={id}
            landing={{ ...landing, title: name.trim() || landing.title, primaryCta: resolvedCta }}
            railEnabled={railEnabled}
            railSlot={railSlot}
            onHint={setHint}
          />
          <div className="ops-canvas-actions">
            <Link href={`/campaigns/view/${id}?preview=1`} className="btn">
              全屏预览
            </Link>
            <button type="button" className="btn" disabled={busy} onClick={() => void copyPreview()}>
              复制预览链
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => void saveAsTemplate()}
            >
              另存模板
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => void copyCampaign()}
            >
              复制活动
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => void extend()}>
              延期 7 天
            </button>
          </div>
        </div>
      </div>
    </OpsPcShell>
  );
}
