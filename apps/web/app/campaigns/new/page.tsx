'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  api,
  type OpsCampaignLanding,
  type OpsCampaignTemplate,
} from '@/lib/api';
import { CampaignAdminGate } from '@/components/campaigns/CampaignAdminGate';
import { OpsPcShell } from '@/components/campaigns/OpsPcShell';
import {
  CAMPAIGN_SCENES,
  type CampaignSceneId,
  sceneById,
} from '@/lib/campaign_scenes';
import { defaultPrimaryCta } from '@/lib/campaign_nav';

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
  const [sceneId, setSceneId] = useState<CampaignSceneId | ''>('read');
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
        primaryCta: defaultPrimaryCta(opts.templateId),
      };
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
      const cta = defaultPrimaryCta(opts.templateId, campaign.id);
      await api
        .updateCampaign(campaign.id, {
          name: campaign.name,
          templateId: campaign.templateId,
          status: 'draft',
          startAt: campaign.startAt,
          endAt: campaign.endAt,
          subtitle: campaign.subtitle || '',
          railSlot: campaign.railSlot,
          railEnabled: campaign.railEnabled !== false,
          groupIds: campaign.groupIds || defaultGroupIds,
          audienceMode: (campaign.audienceMode as 'groups' | 'all' | 'admin_preview') || 'groups',
          landing: { ...landing, primaryCta: cta },
          heroEnabled: false,
        })
        .catch(() => null);
      router.replace(`/campaigns/${campaign.id}/edit`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '创建失败');
      setBusy(false);
    }
  };

  return (
    <OpsPcShell title="新建活动" sub="选择读经模板后进入完整配置（电脑端工作台）">
      {err ? (
        <p className="ops-banner ops-banner-warn" style={{ color: 'var(--danger, #b00)' }}>
          {err}
        </p>
      ) : null}
      {busy ? <p className="muted">正在创建草稿…</p> : null}

      <div className="ops-pc-new">
        <label className="ops-field">
          <span>场景</span>
          <select
            className="input ops-scene-select"
            value={sceneId}
            disabled={busy}
            onChange={(e) => {
              setSceneId((e.target.value || 'read') as CampaignSceneId);
              setErr(null);
            }}
            aria-label="选择活动场景"
          >
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

        <div className="ops-select-list">
          {sceneId === 'mine' ? (
            userTemplates.map((t) => (
              <button
                key={t.id}
                type="button"
                className="card row-card home-list-row home-list-row-wrap profile-soft-row ops-select-row"
                disabled={busy}
                onClick={() =>
                  void startDraft({
                    templateId: t.baseTemplateId,
                    name: t.name,
                    landing: t.landing || {},
                  })
                }
              >
                <span className="pill">我的</span>
                <span className="home-list-main">
                  <strong>{t.name}</strong>
                  <span className="muted home-list-sub">基于平台模板复用</span>
                </span>
                <span className="muted home-list-chevron">›</span>
              </button>
            ))
          ) : (
            <>
              <p className="muted" style={{ fontSize: 13, margin: '4px 0 0' }}>
                {sceneById(sceneId as CampaignSceneId)?.sub}
              </p>
              {sceneTemplates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="card row-card home-list-row home-list-row-wrap profile-soft-row ops-select-row"
                  disabled={busy}
                  onClick={() =>
                    void startDraft({
                      templateId: t.id,
                      name: t.name,
                      landing: t.landing || {},
                    })
                  }
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
      </div>
    </OpsPcShell>
  );
}
