'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  campaignStatusLabel,
  campaignStatusTone,
  parseDaysFromBulkText,
} from '@/lib/campaign_ops';
import { fetchAdminEligible } from '@/lib/admin_rag';
import { QUICK_HREFS } from '@/lib/campaign_nav';
import { CampaignAdminGate } from '@/components/campaigns/CampaignAdminGate';

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
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [landing, setLanding] = useState<OpsCampaignLanding>({});
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const skipDraftOnce = useRef(true);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [audienceMode, setAudienceMode] = useState<'groups' | 'all' | 'admin_preview'>('groups');

  const checklist = useMemo(
    () =>
      buildPublishChecklist({
        name,
        templateId: camp?.templateId || '',
        groupIds,
        landing: { ...landing, title: name.trim() || landing.title },
        railEnabled,
        railSlot,
        audienceMode,
        isPlatformAdmin,
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
    ],
  );

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
      setGroups(g.groups || []);
      setName(campaign.name);
      setSubtitle(campaign.subtitle || '');
      setStatus(campaign.status);
      setGroupIds(campaign.groupIds || []);
      setRailSlot(campaign.railSlot || 1);
      setRailEnabled(campaign.railEnabled !== false);
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
        setGroupIds(draft!.groupIds);
        setRailSlot(draft!.railSlot);
        setRailEnabled(draft!.railEnabled);
        setStartAt(draft!.startAt);
        setEndAt(draft!.endAt);
        setLanding(draft!.landing || {});
        setHint('已恢复本地草稿');
      } else {
        setLanding(campaign.landing || {});
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
        railSlot,
        railEnabled,
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
    railSlot,
    railEnabled,
    startAt,
    endAt,
    landing,
  ]);

  const toggleGroup = (gid: string) => {
    setGroupIds((prev) => (prev.includes(gid) ? prev.filter((x) => x !== gid) : [...prev, gid]));
  };

  const save = async (nextStatus?: string) => {
    if (!camp) return;
    const target = nextStatus || status;
    if (target === 'published') {
      const errs = buildPublishChecklist({
        name,
        templateId: camp.templateId,
        groupIds,
        landing: { ...landing, title: name.trim() || landing.title },
        audienceMode,
        isPlatformAdmin,
      });
      if (errs.length) {
        setErr(errs.join('；'));
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
        groupIds: audienceMode === 'groups' ? groupIds : [],
        landing: {
          ...landing,
          title: name.trim() || landing.title,
        },
        audienceMode: isPlatformAdmin ? audienceMode : 'groups',
        heroEnabled: false,
      });
      setCamp(campaign);
      setStatus(campaign.status);
      setAudienceMode((campaign.audienceMode as typeof audienceMode) || 'groups');
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

  const updateDay = (idx: number, patch: Partial<NonNullable<OpsCampaignLanding['days']>[number]>) => {
    const days = [...(landing.days || [])];
    days[idx] = { ...days[idx], ...patch, day: days[idx]?.day || idx + 1 };
    setLanding({ ...landing, days });
  };

  const addDay = () => {
    const days = [...(landing.days || [])];
    const next = (days[days.length - 1]?.day || days.length) + 1;
    days.push({ day: next, title: `第 ${next} 天`, body: '', verseRef: '', discussionHint: '' });
    setLanding({ ...landing, days });
  };

  const applyBulk = () => {
    const days = parseDaysFromBulkText(bulkText);
    if (!days.length) {
      setErr('没有解析到日课内容');
      return;
    }
    setLanding({ ...landing, days });
    setBulkOpen(false);
    setHint(`已导入 ${days.length} 天`);
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

  const dayUnlock = landing.features?.dayUnlock || 'all';

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
        <Link href="/campaigns" className="ops-back">
          ← 活动运营
        </Link>
        <p className="ops-banner ops-banner-warn" style={{ color: 'var(--danger, #b00)' }}>
          {err}
        </p>
      </main>
    );
  }

  const scrollTo = (anchor: string) => {
    document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <main className="container ops-page">
      <div className="ops-page-head">
        <div>
          <Link href="/campaigns" className="ops-back">
            ← 活动运营
          </Link>
          <h1 className="ops-page-title">{name.trim() || '编辑活动'}</h1>
          {camp ? (
            <p className="ops-page-sub" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className={`ops-status ops-status-${campaignStatusTone(status)}`}>
                {campaignStatusLabel(status)}
              </span>
              <span>{camp.tag || '活动'}</span>
              {hint ? <span>· {hint}</span> : null}
            </p>
          ) : null}
        </div>
      </div>

      {camp?.stats ? (
        <div className="ops-stats-grid">
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
      ) : null}

      {err ? <p className="ops-banner ops-banner-warn" style={{ color: 'var(--danger, #b00)' }}>{err}</p> : null}

      {checklist.length > 0 ? (
        <div className="ops-banner ops-banner-warn">
          <strong style={{ display: 'block', marginBottom: 4 }}>发布前检查</strong>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {checklist.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="ops-banner ops-banner-ok">发布检查已通过，可以发布。</p>
      )}

      <nav className="ops-chip-row ops-jump" aria-label="编辑分区">
        {(
          [
            ['ops-sec-basic', '基本'],
            ['ops-sec-audience', '可见范围'],
            ['ops-sec-exposure', '首页曝光'],
            ['ops-sec-content', '落地页内容'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" className="ops-chip" onClick={() => scrollTo(id)}>
            {label}
          </button>
        ))}
      </nav>

      <div id="ops-sec-basic" className="settings-card">
        <p className="settings-title">基本信息</p>
        <label className="ops-field">
          <span>活动名称</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="ops-field" style={{ marginTop: 10 }}>
          <span>今日推荐副文案</span>
          <input className="input" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
        </label>
        <label className="ops-field" style={{ marginTop: 10 }}>
          <span>落地页说明</span>
          <textarea
            className="input"
            rows={3}
            value={landing.body || ''}
            onChange={(e) => setLanding({ ...landing, body: e.target.value })}
          />
        </label>
        <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>
          粘贴教材内容前，请确认你有权在群体内使用。
        </p>
      </div>

      <div id="ops-sec-audience" className="settings-card">
        <p className="settings-title">谁能看见</p>
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
              暂无群可选。可改为全站，或先去发现创建群。
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

      <div id="ops-sec-exposure" className="settings-card">
        <p className="settings-title">首页今日推荐</p>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
          出现在首页「今日推荐」最多三张卡中；第 1 位为主卡。不占用每日经文 Hero。
        </p>
        <label className="ops-check-row">
          <input type="checkbox" checked={railEnabled} onChange={(e) => setRailEnabled(e.target.checked)} />
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
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr', marginTop: 12 }}>
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

      <div id="ops-sec-content" className="settings-card">
        <p className="settings-title">落地页内容</p>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
          按模板类型显示对应块；不需要的块不会出现。
        </p>

        {(landing.days || []).length > 0 ? (
          <div className="ops-subblock">
            <p className="ops-subblock-title">日课解锁</p>
            <label className="ops-check-row">
              <input
                type="radio"
                checked={dayUnlock === 'all'}
                onChange={() =>
                  setLanding({
                    ...landing,
                    features: { ...(landing.features || {}), dayUnlock: 'all' },
                  })
                }
              />
              全部可读
            </label>
            <label className="ops-check-row">
              <input
                type="radio"
                checked={dayUnlock === 'by_start'}
                onChange={() =>
                  setLanding({
                    ...landing,
                    features: { ...(landing.features || {}), dayUnlock: 'by_start' },
                  })
                }
              />
              按开始日每天解锁一天
            </label>
          </div>
        ) : null}

        {camp?.templateId === 'gathering' || camp?.templateId === 'season' ? (
          <div className="ops-subblock" style={{ display: 'grid', gap: 8 }}>
            <p className="ops-subblock-title">聚会 / 节期信息</p>
            <input
              className="input"
              placeholder="地点"
              value={landing.schedule?.location || ''}
              onChange={(e) =>
                setLanding({
                  ...landing,
                  schedule: {
                    ...(landing.schedule || {}),
                    location: e.target.value,
                    startsAt: fromLocalInput(startAt),
                  },
                  features: { ...(landing.features || {}), countdown: true },
                })
              }
            />
            <input
              className="input"
              placeholder="线上说明"
              value={landing.schedule?.onlineNote || ''}
              onChange={(e) =>
                setLanding({
                  ...landing,
                  schedule: { ...(landing.schedule || {}), onlineNote: e.target.value },
                })
              }
            />
            {camp.templateId === 'season' ? (
              <label className="ops-check-row">
                <input
                  type="checkbox"
                  checked={Boolean(landing.features?.rsvp)}
                  onChange={(e) =>
                    setLanding({
                      ...landing,
                      features: { ...(landing.features || {}), rsvp: e.target.checked },
                    })
                  }
                />
                同时收集出席（RSVP）
              </label>
            ) : null}
          </div>
        ) : null}

        <div className="ops-subblock" style={{ display: 'grid', gap: 8 }}>
          <p className="ops-subblock-title">主按钮（CTA）</p>
          <input
            className="input"
            placeholder="按钮文案"
            value={landing.primaryCta?.label || ''}
            onChange={(e) =>
              setLanding({
                ...landing,
                primaryCta: { ...(landing.primaryCta || {}), label: e.target.value },
              })
            }
          />
          <input
            className="input"
            placeholder="链接（站内 /reader 或 https://…）"
            value={landing.primaryCta?.href || ''}
            onChange={(e) =>
              setLanding({
                ...landing,
                primaryCta: { ...(landing.primaryCta || {}), href: e.target.value },
              })
            }
          />
          <div className="ops-chip-row" style={{ marginTop: 0 }}>
            {QUICK_HREFS.map((q) => (
              <button
                key={q.href}
                type="button"
                className="ops-chip"
                onClick={() =>
                  setLanding({
                    ...landing,
                    primaryCta: {
                      label: landing.primaryCta?.label || q.label,
                      href: q.href,
                    },
                  })
                }
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>

        {camp?.templateId === 'hub' || (landing.entries || []).length > 0 ? (
          <div className="ops-subblock">
            <div className="ops-subblock-head">
              <p className="ops-subblock-title" style={{ margin: 0 }}>
                多入口
              </p>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  const entries = [...(landing.entries || [])];
                  const n = entries.length + 1;
                  entries.push({
                    id: `e${n}_${Date.now().toString(36)}`,
                    title: `入口 ${n}`,
                    sub: '',
                    href: '/reader',
                  });
                  setLanding({ ...landing, entries });
                }}
              >
                加入口
              </button>
            </div>
            <p className="muted" style={{ fontSize: 12, margin: '6px 0 8px' }}>
              至少 2 个有效入口（标题 + 链接）才能发布
            </p>
            <div style={{ display: 'grid', gap: 10 }}>
              {(landing.entries || []).map((e, idx) => (
                <div key={e.id || idx} className="ops-nested-card">
                  <input
                    className="input"
                    placeholder="标题"
                    value={e.title}
                    onChange={(ev) => {
                      const entries = [...(landing.entries || [])];
                      entries[idx] = { ...entries[idx], title: ev.target.value };
                      setLanding({ ...landing, entries });
                    }}
                  />
                  <input
                    className="input"
                    placeholder="副文案（可选）"
                    value={e.sub || ''}
                    onChange={(ev) => {
                      const entries = [...(landing.entries || [])];
                      entries[idx] = { ...entries[idx], sub: ev.target.value };
                      setLanding({ ...landing, entries });
                    }}
                  />
                  <input
                    className="input"
                    placeholder="链接"
                    value={e.href}
                    onChange={(ev) => {
                      const entries = [...(landing.entries || [])];
                      entries[idx] = { ...entries[idx], href: ev.target.value };
                      setLanding({ ...landing, entries });
                    }}
                  />
                  <div className="ops-chip-row" style={{ marginTop: 0, alignItems: 'center' }}>
                    {QUICK_HREFS.map((q) => (
                      <button
                        key={q.href}
                        type="button"
                        className="ops-chip"
                        onClick={() => {
                          const entries = [...(landing.entries || [])];
                          entries[idx] = { ...entries[idx], href: q.href };
                          setLanding({ ...landing, entries });
                        }}
                      >
                        {q.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="btn"
                      style={{ marginLeft: 'auto' }}
                      onClick={() => {
                        const entries = (landing.entries || []).filter((_, i) => i !== idx);
                        setLanding({ ...landing, entries });
                      }}
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {camp?.templateId === 'serve' || landing.features?.signup || (landing.slots || []).length > 0 ? (
          <div className="ops-subblock">
            <div className="ops-subblock-head">
              <p className="ops-subblock-title" style={{ margin: 0 }}>
                岗位名额
              </p>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  const slots = [...(landing.slots || [])];
                  const n = slots.length + 1;
                  slots.push({
                    id: `slot_${n}_${Date.now().toString(36)}`,
                    title: `岗位 ${n}`,
                    limit: 5,
                  });
                  setLanding({
                    ...landing,
                    slots,
                    features: { ...(landing.features || {}), signup: true, questions: true },
                  });
                }}
              >
                加岗位
              </button>
            </div>
            <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
              {(landing.slots || []).map((s, idx) => (
                <div key={s.id} className="ops-nested-card ops-slot-row">
                  <input
                    className="input"
                    value={s.title}
                    onChange={(e) => {
                      const slots = [...(landing.slots || [])];
                      slots[idx] = { ...slots[idx], title: e.target.value };
                      setLanding({ ...landing, slots });
                    }}
                    placeholder="岗位名称"
                  />
                  <input
                    className="input"
                    type="number"
                    min={1}
                    value={s.limit}
                    onChange={(e) => {
                      const slots = [...(landing.slots || [])];
                      slots[idx] = {
                        ...slots[idx],
                        limit: Math.max(1, Number(e.target.value) || 1),
                      };
                      setLanding({ ...landing, slots });
                    }}
                    aria-label="名额"
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {(landing.days || []).length > 0 ||
        ['multi_day', 'memory', 'verse_day'].includes(camp?.templateId || '') ? (
          <div className="ops-subblock">
            <div className="ops-subblock-head">
              <p className="ops-subblock-title" style={{ margin: 0 }}>
                日课 / 清单
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn" onClick={() => setBulkOpen((v) => !v)}>
                  批量粘贴
                </button>
                <button type="button" className="btn" onClick={addDay}>
                  加一天
                </button>
              </div>
            </div>
            {bulkOpen ? (
              <div className="ops-nested-card" style={{ marginTop: 8 }}>
                <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
                  每天一段，空行分隔；首行可作标题
                </p>
                <textarea
                  className="input"
                  rows={8}
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                />
                <button type="button" className="btn btn-primary" style={{ marginTop: 8 }} onClick={applyBulk}>
                  导入并替换
                </button>
              </div>
            ) : null}
            <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
              {(landing.days || []).map((d, idx) => (
                <div key={d.day || idx} className="ops-nested-card">
                  <strong>第 {d.day || idx + 1} 天</strong>
                  <input
                    className="input"
                    style={{ marginTop: 6 }}
                    value={d.title || ''}
                    onChange={(e) => updateDay(idx, { title: e.target.value })}
                    placeholder="标题"
                  />
                  <textarea
                    className="input"
                    rows={4}
                    style={{ marginTop: 6 }}
                    value={d.body || ''}
                    onChange={(e) => updateDay(idx, { body: e.target.value })}
                    placeholder="正文"
                  />
                  <input
                    className="input"
                    style={{ marginTop: 6 }}
                    value={d.verseRef || ''}
                    onChange={(e) => updateDay(idx, { verseRef: e.target.value })}
                    placeholder="经文引用，如 创 1:1-5"
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="ops-sticky-bar">
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
        <Link href={`/campaigns/view/${id}?preview=1`} className="btn">
          预览
        </Link>
        <button type="button" className="btn" disabled={busy} onClick={() => void saveAsTemplate()}>
          另存模板
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => void extend()}>
          延期 7 天
        </button>
      </div>
    </main>
  );
}
