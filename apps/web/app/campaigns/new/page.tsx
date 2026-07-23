'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  api,
  type OpsCampaignLanding,
  type OpsCampaignTemplate,
} from '@/lib/api';
import { CampaignAdminGate } from '@/components/campaigns/CampaignAdminGate';
import {
  CAMPAIGN_SCENES,
  type CampaignSceneId,
  sceneById,
} from '@/lib/campaign_scenes';

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

export default function CampaignNewPage() {
  return (
    <CampaignAdminGate>
      <CampaignNewInner />
    </CampaignAdminGate>
  );
}

function CampaignNewInner() {
  const router = useRouter();
  const [sceneId, setSceneId] = useState<CampaignSceneId | ''>('');
  const [templates, setTemplates] = useState<OpsCampaignTemplate[]>([]);
  const [userTemplates, setUserTemplates] = useState<
    Array<{ id: string; name: string; baseTemplateId: string; landing: OpsCampaignLanding }>
  >([]);
  const [defaultGroupIds, setDefaultGroupIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [t, g, ut] = await Promise.all([
          api.campaignTemplates(),
          api.campaignStaffGroups(),
          api.listUserCampaignTemplates().catch(() => ({ templates: [] })),
        ]);
        setTemplates(t.templates || []);
        setUserTemplates(ut.templates || []);
        if (g.groups?.length === 1) setDefaultGroupIds([g.groups[0].id]);
      } catch (e) {
        setErr(e instanceof Error ? e.message : '加载失败');
      }
    })();
  }, []);

  const sceneTemplates = useMemo(() => {
    const scene = sceneById(sceneId || null);
    if (!scene) return [];
    const byId = new Map(templates.map((t) => [t.id, t]));
    return scene.templateIds.map((id) => byId.get(id)).filter(Boolean) as OpsCampaignTemplate[];
  }, [sceneId, templates]);

  const onSceneChange = (value: string) => {
    setSceneId((value || '') as CampaignSceneId | '');
    setErr(null);
  };

  const startDraft = async (opts: {
    templateId: string;
    name: string;
    landing: OpsCampaignLanding;
  }) => {
    setBusy(true);
    setErr(null);
    try {
      const starts = new Date();
      const ends = new Date();
      ends.setDate(ends.getDate() + 14);
      const landing: OpsCampaignLanding = {
        ...opts.landing,
        title: opts.name,
      };
      if (opts.templateId === 'gathering') {
        landing.schedule = {
          ...(opts.landing.schedule || {}),
          startsAt: fromLocalInput(toLocalInput(starts)),
          location: opts.landing.schedule?.location || '',
        };
      }
      const { campaign } = await api.createCampaign({
        name: opts.name,
        templateId: opts.templateId,
        status: 'draft',
        startAt: fromLocalInput(toLocalInput(starts)),
        endAt: fromLocalInput(toLocalInput(ends)),
        subtitle: '',
        railSlot: 1,
        railEnabled: true,
        groupIds: defaultGroupIds,
        audienceMode: 'groups',
        landing,
        heroEnabled: false,
      });
      router.replace(`/campaigns/${campaign.id}/edit`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '创建失败');
      setBusy(false);
    }
  };

  const pickPlatformTemplate = (t: OpsCampaignTemplate) => {
    if (busy) return;
    void startDraft({
      templateId: t.id,
      name: t.name,
      landing: t.landing || {},
    });
  };

  const pickUserTemplate = (t: {
    id: string;
    name: string;
    baseTemplateId: string;
    landing: OpsCampaignLanding;
  }) => {
    if (busy) return;
    void startDraft({
      templateId: t.baseTemplateId,
      name: t.name,
      landing: t.landing || {},
    });
  };

  return (
    <main className="container ops-page">
      <div className="ops-page-head">
        <div>
          <Link href="/campaigns" className="ops-back">
            ← 活动运营
          </Link>
          <h1 className="ops-page-title">新建活动</h1>
          <p className="ops-page-sub">下拉选择场景，再点模板进入完整配置</p>
        </div>
      </div>

      {err ? (
        <p className="ops-banner ops-banner-warn" style={{ color: 'var(--danger, #b00)' }}>
          {err}
        </p>
      ) : null}

      {busy ? (
        <p className="muted" style={{ marginTop: 16 }}>
          正在创建草稿…
        </p>
      ) : null}

      <label className="ops-field" style={{ marginTop: 14 }}>
        <span>活动场景</span>
        <select
          className="input ops-scene-select"
          value={sceneId}
          disabled={busy}
          onChange={(e) => onSceneChange(e.target.value)}
          aria-label="选择活动场景"
        >
          <option value="">请选择场景</option>
          {userTemplates.length > 0 ? (
            <option value="mine">我的模板（{userTemplates.length}）</option>
          ) : null}
          {CAMPAIGN_SCENES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
      </label>

      {!sceneId ? (
        <p className="muted" style={{ fontSize: 13, marginTop: 14 }}>
          选好场景后，下方会列出该场景可用的模板。
        </p>
      ) : (
        <div className="ops-select-list">
          {sceneId === 'mine' ? (
            userTemplates.length === 0 ? (
              <div className="card ops-empty">
                <p>还没有我的模板</p>
                <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                  可先从场景模板创建，再在编辑页「另存模板」。
                </p>
              </div>
            ) : (
              userTemplates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="card row-card home-list-row home-list-row-wrap profile-soft-row ops-select-row"
                  disabled={busy}
                  onClick={() => pickUserTemplate(t)}
                >
                  <span className="pill">我的</span>
                  <span className="home-list-main">
                    <strong>{t.name}</strong>
                    <span className="muted home-list-sub">基于平台模板复用</span>
                  </span>
                  <span className="muted home-list-chevron">›</span>
                </button>
              ))
            )
          ) : (
            <>
              <p className="muted" style={{ fontSize: 13, margin: '4px 0 0' }}>
                {sceneById(sceneId)?.sub}
              </p>
              {sceneTemplates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="card row-card home-list-row home-list-row-wrap profile-soft-row ops-select-row"
                  disabled={busy}
                  onClick={() => pickPlatformTemplate(t)}
                >
                  <span className="pill">{t.tag}</span>
                  <span className="home-list-main">
                    <strong>{t.name}</strong>
                    <span className="muted home-list-sub">{t.blurb}</span>
                  </span>
                  <span className="muted home-list-chevron">›</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </main>
  );
}
