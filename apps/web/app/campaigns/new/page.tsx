'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ensureLandingBlocks } from '@/lib/campaign_blocks';
import {
  api,
  type OpsCampaignLanding,
  type OpsCampaignTemplate,
} from '@/lib/api';
import { CampaignAdminGate } from '@/components/campaigns/CampaignAdminGate';
import { OpsPcShell } from '@/components/campaigns/OpsPcShell';
import {
  NEW_PLATFORM_TEMPLATE_IDS,
  PLATFORM_TEMPLATE_BLOCK_LABELS,
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

  const platformTemplates = useMemo(() => {
    const byId = new Map(templates.map((t) => [t.id, t]));
    return NEW_PLATFORM_TEMPLATE_IDS.map((id) => byId.get(id)).filter(
      Boolean,
    ) as OpsCampaignTemplate[];
  }, [templates]);

  const blankTpl = platformTemplates.find((t) => t.id === 'blank');
  const starterTemplates = platformTemplates.filter((t) => t.id !== 'blank');

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
      const landing: OpsCampaignLanding = ensureLandingBlocks(
        {
          ...opts.landing,
          title: opts.name,
          primaryCta: defaultPrimaryCta(opts.templateId),
        },
        opts.templateId,
      );
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
    <OpsPcShell
      title="新建活动"
      backHref="/admin?tab=ops"
      backLabel="活动运营"
      sub="选起点，进编辑器用控件搭落地页"
    >
      {err ? (
        <p className="ops-banner ops-banner-warn" style={{ color: 'var(--danger, #b00)' }}>
          {err}
        </p>
      ) : null}
      {busy ? <p className="muted">正在创建草稿…</p> : null}

      <div className="ops-pc-new">
        <button
          type="button"
          className="ops-new-blank card"
          disabled={busy || !blankTpl}
          onClick={() =>
            void startDraft({
              templateId: 'blank',
              name: '未命名活动',
              landing: blankTpl?.landing || {},
            })
          }
        >
          <span className="ops-new-blank-icon" aria-hidden>
            +
          </span>
          <span className="ops-new-blank-text">
            <strong>从空白开始</strong>
            <span className="muted">只有文本与主按钮，用控件库自由搭建</span>
          </span>
          <span className="muted home-list-chevron">›</span>
        </button>

        <p className="section-label" style={{ marginTop: 22 }}>
          平台模板
        </p>
        <p className="muted" style={{ fontSize: 12, margin: '4px 0 8px' }}>
          预置积木骨架，进编辑后仍可加减控件
        </p>
        <div className="ops-select-list" style={{ marginTop: 4 }}>
          {starterTemplates.map((t) => {
            const labels = PLATFORM_TEMPLATE_BLOCK_LABELS[t.id] || [];
            return (
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
                  {labels.length ? (
                    <span className="ops-tpl-tags">
                      {labels.map((lb) => (
                        <span key={lb} className="ops-tpl-tag">
                          {lb}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </span>
                <span className="muted home-list-chevron">›</span>
              </button>
            );
          })}
        </div>

        {userTemplates.length > 0 ? (
          <>
            <p className="section-label" style={{ marginTop: 22 }}>
              我的模板
            </p>
            <p className="muted" style={{ fontSize: 12, margin: '4px 0 8px' }}>
              编辑页「另存模板」保存的结构与文案
            </p>
            <div className="ops-select-list" style={{ marginTop: 4 }}>
              {userTemplates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="card row-card home-list-row home-list-row-wrap profile-soft-row ops-select-row"
                  disabled={busy}
                  onClick={() =>
                    void startDraft({
                      templateId: t.baseTemplateId || 'blank',
                      name: t.name,
                      landing: t.landing || {},
                    })
                  }
                >
                  <span className="pill">我的</span>
                  <span className="home-list-main">
                    <strong>{t.name}</strong>
                    <span className="muted home-list-sub">复用上次另存的落地页</span>
                  </span>
                  <span className="muted home-list-chevron">›</span>
                </button>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </OpsPcShell>
  );
}
