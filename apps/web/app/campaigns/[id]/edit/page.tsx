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
  loadLastAudiencePref,
  resolveDefaultGroupIds,
  saveLastAudiencePref,
} from '@/lib/campaign_audience_pref';
import {
  buildPublishChecklist,
  CAMPAIGN_CONFIG_SECTIONS,
  campaignSectionDone,
  campaignStatusLabel,
  campaignStatusTone,
  firstIncompleteSection,
  type CampaignConfigSectionId,
} from '@/lib/campaign_ops';
import { getReadingExample, hasReadingExample } from '@/lib/campaign_example_copy';
import { fetchAdminEligible } from '@/lib/admin_rag';
import { resolvePrimaryCta } from '@/lib/campaign_nav';
import { addLandingBlock, BLOCK_CATALOG, ensureLandingBlocks, reorderLandingBlocks, type OpsBlockType } from '@/lib/campaign_blocks';
import { useOpsCanvasResize } from '@/lib/use_ops_canvas_resize';
import { CampaignAdminGate } from '@/components/campaigns/CampaignAdminGate';
import { CampaignBlockEditor } from '@/components/campaigns/CampaignBlockEditor';
import { CampaignLivePreview, type CampaignPreviewEditTarget } from '@/components/campaigns/CampaignLivePreview';
import { CampaignCoverPicker } from '@/components/campaigns/CampaignCoverPicker';
import { OpsPcShell } from '@/components/campaigns/OpsPcShell';
import { normalizeCampaignCoverPath } from '@/lib/daily_verse_wallpaper';

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
  const [coverUrl, setCoverUrl] = useState('');
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
  /** 顶部三 Tab：搭内容 | 改控件 | 发布条件 */
  const [leftTab, setLeftTab] = useState<'palette' | 'config' | 'settings'>('palette');
  const tabSwipeX = useRef<number | null>(null);
  const { gridRef, gridStyle, splitterProps } = useOpsCanvasResize();
  const [focusBlockId, setFocusBlockId] = useState<string | null>(null);

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
  const firstGap = useMemo(() => {
    const incomplete = firstIncompleteSection(checklistInput);
    if (!incomplete) return null;
    const label = checklist[0] || `完善「${incomplete.label}」`;
    return { label, section: incomplete.id, anchor: incomplete.anchor };
  }, [checklist, checklistInput]);

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
      setCoverUrl(normalizeCampaignCoverPath(campaign.coverUrl));
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
      if (draftNewer) {
        setName(draft!.name);
        setSubtitle(draft!.subtitle);
        setStatus(draft!.status);
        setGroupIds((draft!.groupIds || []).filter((gid) => allowed.has(gid)));
        if (draft!.audienceMode) setAudienceMode(draft!.audienceMode);
        setRailSlot(draft!.railSlot);
        setRailEnabled(draft!.railEnabled);
        setRailHref(draft!.railHref || '');
        setCoverUrl(normalizeCampaignCoverPath(draft!.coverUrl));
        setStartAt(draft!.startAt);
        setEndAt(draft!.endAt);
        setLanding(ensureLandingBlocks(draft!.landing || {}, campaign.templateId));
        setHint('已恢复上次编辑');
      } else {
        const pref = loadLastAudiencePref();
        const nextIds =
          savedIds.length > 0
            ? savedIds
            : resolveDefaultGroupIds(
                available.map((x) => x.id),
                pref?.audienceMode === 'groups' ? pref.groupIds : null,
              );
        setGroupIds(nextIds);
        if (!campaign.audienceMode && pref?.audienceMode) {
          const mode = pref.audienceMode;
          setAudienceMode(
            mode === 'all' || mode === 'admin_preview'
              ? adminOk
                ? mode
                : 'groups'
              : 'groups',
          );
        }
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
        coverUrl,
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
    coverUrl,
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

  const handlePreviewEdit = useCallback((target: CampaignPreviewEditTarget) => {
      const scrollTo = (id: string) => {
        window.setTimeout(() => {
          document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 80);
      };
      if (target.kind === 'home-card') {
        setLeftTab('settings');
        setActiveSection('basic');
        setOpenSections((prev) => ({ ...prev, basic: true, exposure: true }));
        scrollTo('ops-sec-basic');
        return;
      }
      if (target.kind === 'landing-title') {
        setLeftTab('settings');
        setActiveSection('basic');
        setOpenSections((prev) => ({ ...prev, basic: true }));
        scrollTo('ops-sec-basic');
        return;
      }
      if (target.kind === 'block') {
        setLeftTab('config');
        setActiveSection('content');
        setFocusBlockId(target.blockId);
        return;
      }
      if (target.kind === 'days' || target.kind === 'cta') {
        setLeftTab('config');
        setActiveSection('content');
        const blocks = landing.blocks || [];
        const hit =
          target.kind === 'days'
            ? blocks.find((b) => b.type === 'days')
            : blocks.find((b) => b.type === 'cta');
        if (hit) setFocusBlockId(hit.id);
        else setFocusBlockId(blocks[0]?.id || null);
      }
    },
    [landing.blocks],
  );

  const handleInsertBlock = useCallback((type: OpsBlockType, beforeId?: string) => {
    let added = false;
    setLanding((prev) => {
      const result = addLandingBlock(prev, type, beforeId ? { beforeId } : undefined);
      if (!result) return prev;
      added = true;
      queueMicrotask(() => {
        setFocusBlockId(result.blockId);
        openLeftTab('config');
        setHint(`已添加「${BLOCK_CATALOG[type].label}」，可在「改控件」中修改`);
      });
      return result.landing;
    });
    if (!added) setHint('该控件已存在（单例）');
  }, []);

  const handleReorderBlocks = useCallback((fromId: string, toId: string | null) => {
    setLanding((prev) => reorderLandingBlocks(prev, fromId, toId));
  }, []);

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
        coverUrl: coverUrl.trim() || null,
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
      setCoverUrl(normalizeCampaignCoverPath(campaign.coverUrl));
      setLanding(ensureLandingBlocks(campaign.landing || landing, campaign.templateId));
      clearCampaignDraft(id);
      skipDraftOnce.current = true;
      saveLastAudiencePref({
        audienceMode: isPlatformAdmin ? audienceMode : 'groups',
        groupIds: audienceMode === 'groups' ? groupIds : [],
      });
      setHint('已保存');
      if (nextStatus === 'published') {
        router.push(`/campaigns/${id}`);
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
        <Link href={`/campaigns/${id}`} className="ops-back">
          ← 活动详情
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
      backHref={`/campaigns/${id}`}
      backLabel="活动详情"
      sub={
        camp ? (
          <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className={`ops-status ops-status-${campaignStatusTone(status)}`}>
              {campaignStatusLabel(status)}
            </span>
            <span>{camp.tag || '活动'}</span>
            <span>
              {doneCount}/{CAMPAIGN_CONFIG_SECTIONS.length} 就绪
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
          <div className="ops-publish-cluster">
            {firstGap ? (
              <button
                type="button"
                className="ops-publish-gap"
                onClick={() => jumpToSection(firstGap.section, firstGap.anchor)}
              >
                还差：{firstGap.label}
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || checklist.length > 0}
              onClick={() => void save('published')}
              title={checklist[0] || undefined}
            >
              发布
            </button>
          </div>
        </>
      }
    >
      {err ? <p className="ops-banner ops-banner-warn" style={{ color: 'var(--danger, #b00)' }}>{err}</p> : null}

      <nav className="ops-canvas-tabs" aria-label="编辑分区">
        {(
          [
            ['palette', '搭内容'],
            ['config', '改控件'],
            ['settings', '发布条件'],
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
        ref={gridRef}
        className={`ops-canvas-grid${leftTab === 'settings' ? ' is-settings-tab' : ''}`}
        style={gridStyle}
        onTouchStart={onTabSwipeStart}
        onTouchEnd={onTabSwipeEnd}
      >
        {leftTab === 'settings' ? (
          <div className="ops-canvas-settings" aria-label="发布条件">
            <div
              id="ops-sec-basic"
              className={`settings-card ops-sec${openSections.basic ? '' : ' is-collapsed'}`}
            >
              <button type="button" className="ops-sec-toggle" onClick={() => toggleSection('basic')}>
                <span className="settings-title" style={{ margin: 0 }}>
                  叫什么
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
                <span>首页卡副文案</span>
                <input
                  className="input"
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  placeholder="进入活动"
                />
                <span className="muted" style={{ display: 'block', marginTop: 4, fontSize: 12 }}>
                  也可在中间首页卡预览里直接改
                </span>
              </label>
              <div style={{ marginTop: 12 }}>
                <CampaignCoverPicker
                  value={coverUrl}
                  onChange={(path) => setCoverUrl(normalizeCampaignCoverPath(path))}
                />
              </div>
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
                  给谁看
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
                      ['groups', '我的群'],
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
                  何时出现
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
                  placeholder="留空=活动落地页；创世记可填外链"
                />
                <span className="muted" style={{ display: 'block', marginTop: 4, fontSize: 12 }}>
                  创世记 50 天等外链会自动登录进入
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
          </div>
        ) : null}

        {leftTab === 'settings' ? <div {...splitterProps(0)} /> : null}

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
          leadingSplitter={<div {...splitterProps(0)} />}
          centerSlot={
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
                onEdit={handlePreviewEdit}
                onChangeName={setName}
                onChangeSubtitle={setSubtitle}
                onChangeRailSlot={setRailSlot}
                onChangeRailEnabled={setRailEnabled}
                coverUrl={coverUrl}
                onChangeCoverUrl={(path) => setCoverUrl(normalizeCampaignCoverPath(path))}
                onInsertBlock={handleInsertBlock}
                onReorderBlocks={handleReorderBlocks}
              />
              <div className="ops-canvas-actions">
                <Link href={`/campaigns/${id}`} className="btn">
                  返回详情
                </Link>
                <Link href={`/campaigns/view/${id}?preview=1`} className="btn">
                  全屏预览
                </Link>
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => void saveAsTemplate()}
                >
                  另存模板
                </button>
              </div>
            </div>
          }
          trailingSplitter={<div {...splitterProps(1)} />}
          focusBlockId={focusBlockId}
          onFocusBlockConsumed={() => setFocusBlockId(null)}
        />
      </div>
    </OpsPcShell>
  );
}
