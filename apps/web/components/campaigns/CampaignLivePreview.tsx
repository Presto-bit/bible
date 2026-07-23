'use client';

import { useState } from 'react';
import type { OpsCampaignLanding } from '@/lib/api';
import { RAIL_ICONS, trimRailSub, trimRailTitle, type RailCard } from '@/lib/home_rail';
import { RailCardVisual } from '@/components/home/RailCardVisual';
import { CampaignLandingBlocks } from '@/components/campaigns/CampaignLandingBlocks';
import { campaignPreviewUrl, copyText } from '@/lib/campaign_ops';

type PreviewTab = 'home' | 'landing';
type PreviewDevice = 'phone' | 'desktop';

/** 配置页右侧实时预览：首页卡 + 落地页（手机/桌面） */
export function CampaignLivePreview({
  name,
  subtitle,
  tag,
  templateId,
  campaignId,
  landing,
  railEnabled,
  railSlot,
  onHint,
}: {
  name: string;
  subtitle?: string;
  tag?: string;
  templateId: string;
  campaignId?: string;
  landing: OpsCampaignLanding;
  railEnabled?: boolean;
  railSlot?: number;
  onHint?: (msg: string) => void;
}) {
  const [tab, setTab] = useState<PreviewTab>(railEnabled === false ? 'landing' : 'home');
  const [device, setDevice] = useState<PreviewDevice>('phone');
  const title = (landing.title || name || '活动标题').trim() || '活动标题';
  const body = (landing.body || '').trim();

  const railCard: RailCard = {
    id: 'campaign-preview',
    kind: 'media',
    tint: 'rose',
    layout: 'scene-caption',
    tag: tag || '活动',
    reason: '群活动',
    title: trimRailTitle(name.trim() || title),
    sub: trimRailSub(subtitle?.trim() || body.slice(0, 40) || '副文案'),
    href: '#preview-landing',
    icon: RAIL_ICONS.campaign,
    sceneId: 'plan',
    mediaCaption: trimRailTitle(name.trim() || title, 20),
    mediaCaptionRight: railSlot ? `${railSlot}` : undefined,
  };

  const copyPreviewLink = async () => {
    if (!campaignId) {
      onHint?.('保存草稿后可复制预览链');
      return;
    }
    const ok = await copyText(campaignPreviewUrl(campaignId));
    onHint?.(ok ? '预览链已复制（带 preview=1）' : '复制失败');
  };

  return (
    <aside className="ops-preview-panel" aria-label="实时预览">
      <div className="ops-preview-head">
        <strong>实时预览</strong>
        <div className="ops-preview-head-actions">
          {campaignId ? (
            <button type="button" className="text-link" style={{ fontSize: 12 }} onClick={() => void copyPreviewLink()}>
              复制预览链
            </button>
          ) : null}
        </div>
      </div>

      <div className="ops-preview-tabs" role="tablist" aria-label="预览视图">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'home'}
          className={`ops-preview-tab${tab === 'home' ? ' is-on' : ''}`}
          onClick={() => setTab('home')}
        >
          首页卡片
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'landing'}
          className={`ops-preview-tab${tab === 'landing' ? ' is-on' : ''}`}
          onClick={() => setTab('landing')}
        >
          落地页
        </button>
      </div>

      {tab === 'landing' ? (
        <div className="ops-preview-device-row" role="group" aria-label="预览设备">
          <button
            type="button"
            className={`ops-chip${device === 'phone' ? ' is-on' : ''}`}
            onClick={() => setDevice('phone')}
          >
            手机
          </button>
          <button
            type="button"
            className={`ops-chip${device === 'desktop' ? ' is-on' : ''}`}
            onClick={() => setDevice('desktop')}
          >
            桌面
          </button>
        </div>
      ) : null}

      {tab === 'home' ? (
        <div className="ops-preview-home">
          {railEnabled === false ? (
            <p className="muted" style={{ fontSize: 12, margin: '0 0 10px' }}>
              未挂今日推荐；成员需通过链接进入落地页。
            </p>
          ) : (
            <p className="muted" style={{ fontSize: 12, margin: '0 0 10px' }}>
              今日推荐 · 第 {railSlot || 1} 位（示意）
            </p>
          )}
          <button
            type="button"
            className="ops-preview-rail-card rail-card rail-card-content card card-media card-tint-rose rail-card-layout-scene-caption card-2 card-tint"
            onClick={() => setTab('landing')}
            title="点击查看落地页预览"
          >
            <RailCardVisual card={railCard} />
            <div className="rail-card-body rail-card-body-padded">
              <div className="rail-head">
                <span className="pill">{railCard.tag}</span>
              </div>
              {railCard.sub ? <div className="rail-title">{railCard.sub}</div> : null}
            </div>
          </button>
          <p className="muted" style={{ fontSize: 12, margin: '10px 0 0' }}>
            点击卡片 → 查看落地页效果
          </p>
        </div>
      ) : (
        <div className={device === 'phone' ? 'ops-preview-phone' : 'ops-preview-desktop'}>
          {device === 'phone' ? <div className="ops-preview-phone-bar" aria-hidden /> : null}
          <div className={device === 'phone' ? 'ops-preview-phone-body' : 'ops-preview-desktop-body'}>
            <h2 className="ops-preview-title">{title}</h2>
            <CampaignLandingBlocks
              landing={landing}
              templateId={templateId}
              campaignId={campaignId}
              mode="preview"
              tag={tag}
            />
          </div>
        </div>
      )}
    </aside>
  );
}
