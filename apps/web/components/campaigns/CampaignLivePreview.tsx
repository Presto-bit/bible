'use client';

import { useMemo, useState } from 'react';
import type { OpsCampaignLanding } from '@/lib/api';
import { RAIL_ICONS, trimRailSub, trimRailTitle, type RailCard } from '@/lib/home_rail';
import { RailCardVisual } from '@/components/home/RailCardVisual';
import { CampaignLandingBlocks } from '@/components/campaigns/CampaignLandingBlocks';
import { campaignPreviewUrl, copyText } from '@/lib/campaign_ops';
import { resolvePrimaryCta } from '@/lib/campaign_nav';

type PreviewTab = 'home' | 'landing' | 'reading';
type PreviewDevice = 'phone' | 'desktop';

function isSelfLandingHref(href: string, campaignId?: string): boolean {
  if (!campaignId) return false;
  const path = `/campaigns/view/${campaignId}`;
  const raw = (href || '').trim();
  return raw === path || raw.startsWith(`${path}?`) || raw.startsWith(`${path}#`);
}

/** 主按钮是否进入「本页日课阅读」（非外链/读经器） */
function ctaOpensInPageReading(templateId: string, href: string, campaignId?: string): boolean {
  if (templateId === 'multi_day' || templateId === 'memory') return true;
  return isSelfLandingHref(href, campaignId);
}

/** 配置页右侧实时预览：首页卡 + 落地页 + 主按钮点击后的阅读态 */
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
  const [previewDay, setPreviewDay] = useState(1);
  const title = (landing.title || name || '活动标题').trim() || '活动标题';
  const body = (landing.body || '').trim();
  const cta = resolvePrimaryCta(templateId, campaignId, landing.primaryCta);
  const inPageReading = ctaOpensInPageReading(templateId, cta.href, campaignId);
  const days = landing.days || [];

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

  const onPreviewCta = () => {
    if (inPageReading) {
      const first = days[0]?.day || 1;
      setPreviewDay(first);
      setTab('reading');
      onHint?.('主按钮进入本页「今日阅读」：选天读日课（不是新页面）');
      return;
    }
    onHint?.(`主按钮将打开：${cta.href || '（未设置链接）'}`);
  };

  return (
    <aside className="ops-preview-panel" aria-label="实时预览">
      <div className="ops-preview-head">
        <strong>实时预览</strong>
        <div className="ops-preview-head-actions">
          {campaignId ? (
            <button
              type="button"
              className="text-link"
              style={{ fontSize: 12 }}
              onClick={() => void copyPreviewLink()}
            >
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
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'reading'}
          className={`ops-preview-tab${tab === 'reading' ? ' is-on' : ''}`}
          onClick={() => setTab('reading')}
          title="成员点「开始今日阅读」后看到的日课阅读布局"
        >
          今日阅读
        </button>
      </div>

      {tab !== 'home' ? (
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
            点击卡片 → 落地页 → 再点主按钮看「今日阅读」
          </p>
        </div>
      ) : (
        <div className={device === 'phone' ? 'ops-preview-phone' : 'ops-preview-desktop'}>
          {device === 'phone' ? <div className="ops-preview-phone-bar" aria-hidden /> : null}
          <div className={device === 'phone' ? 'ops-preview-phone-body' : 'ops-preview-desktop-body'}>
            {tab === 'landing' ? (
              <>
                <h2 className="ops-preview-title">{title}</h2>
                <p className="muted" style={{ fontSize: 12, margin: 0 }}>
                  可点主按钮「{cta.label}」预览点击后布局
                </p>
                <CampaignLandingBlocks
                  landing={landing}
                  templateId={templateId}
                  campaignId={campaignId}
                  mode="preview"
                  tag={tag}
                  onCtaClick={onPreviewCta}
                />
              </>
            ) : (
              <PreviewReadingPane
                title={title}
                templateId={templateId}
                days={days}
                day={previewDay}
                setDay={setPreviewDay}
                ctaLabel={cta.label}
                ctaHref={cta.href}
                inPageReading={inPageReading}
                onBack={() => setTab('landing')}
              />
            )}
          </div>
        </div>
      )}
    </aside>
  );
}

function PreviewReadingPane({
  title,
  templateId,
  days,
  day,
  setDay,
  ctaLabel,
  ctaHref,
  inPageReading,
  onBack,
}: {
  title: string;
  templateId: string;
  days: NonNullable<OpsCampaignLanding['days']>;
  day: number;
  setDay: (d: number) => void;
  ctaLabel: string;
  ctaHref: string;
  inPageReading: boolean;
  onBack: () => void;
}) {
  const isMemory = templateId === 'memory';
  const current = useMemo(
    () => days.find((d) => d.day === day) || days[0],
    [days, day],
  );
  const idx = days.findIndex((d) => d.day === (current?.day || day));
  const prev = idx > 0 ? days[idx - 1] : null;
  const next = idx >= 0 && idx < days.length - 1 ? days[idx + 1] : null;

  if (!inPageReading) {
    return (
      <div className="ops-preview-reading">
        <button type="button" className="text-link" style={{ fontSize: 12 }} onClick={onBack}>
          ← 返回落地页
        </button>
        <h2 className="ops-preview-title" style={{ marginTop: 8 }}>
          主按钮跳转
        </h2>
        <p className="muted" style={{ fontSize: 13 }}>
          「{ctaLabel}」将打开站内/外链页面，不在活动落地页内阅读：
        </p>
        <code className="ops-preview-href">{ctaHref || '（未设置）'}</code>
        <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
          可用「全屏预览」在真实页面点按验证。
        </p>
      </div>
    );
  }

  if (!days.length) {
    return (
      <div className="ops-preview-reading">
        <button type="button" className="text-link" style={{ fontSize: 12 }} onClick={onBack}>
          ← 返回落地页
        </button>
        <h2 className="ops-preview-title" style={{ marginTop: 8 }}>
          {title}
        </h2>
        <p className="muted" style={{ fontSize: 13 }}>
          还没有日课。请在左侧「日课列表」添加内容后，即可在此预览点击主按钮后的阅读布局。
        </p>
      </div>
    );
  }

  return (
    <div className="ops-preview-reading">
      <button type="button" className="text-link" style={{ fontSize: 12 }} onClick={onBack}>
        ← 返回落地页
      </button>
      <p className="ops-preview-reading-hint">
        成员点「{ctaLabel}」后：仍在本活动页，进入日课阅读（选天 → 读正文 → 可打开圣经）
      </p>
      <h2 className="ops-preview-title">{title}</h2>
      <div className="ops-progress" style={{ margin: '4px 0 10px' }}>
        <div className="ops-progress-track" aria-hidden>
          <div className="ops-progress-fill" style={{ width: '0%' }} />
        </div>
        <span className="ops-progress-label">
          已完成 0/{days.length}（示意）
        </span>
      </div>
      <p className="section-label" style={{ marginBottom: 6 }}>
        {isMemory ? '背诵清单' : '日课'}
      </p>
      <div className="ops-day-chips" role="tablist" aria-label="预览选天">
        {days.map((d) => (
          <button
            key={d.day}
            type="button"
            role="tab"
            aria-selected={day === d.day}
            className={`ops-day-chip${(current?.day || day) === d.day ? ' is-on' : ''}`}
            onClick={() => setDay(d.day)}
          >
            {d.day}
          </button>
        ))}
      </div>
      {current ? (
        <div className="card" style={{ padding: 14, marginTop: 8 }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>
            {current.title || `第 ${current.day} 天`}
          </h3>
          {current.verseRef ? (
            <p className="muted" style={{ fontSize: 12, margin: '0 0 8px' }}>
              经文：{current.verseRef}
              <span className="ops-preview-reader-link"> · 打开圣经</span>
            </p>
          ) : null}
          <div className="ops-view-body" style={{ marginTop: 0 }}>
            {(current.body || '').trim() || (
              <span className="muted">（本日正文待填写）</span>
            )}
          </div>
          {current.discussionHint ? (
            <p className="ops-banner ops-banner-info" style={{ marginTop: 10, marginBottom: 0 }}>
              讨论：{current.discussionHint}
            </p>
          ) : null}
          <button type="button" className="btn btn-primary" style={{ marginTop: 12, width: '100%' }} disabled>
            {isMemory ? '标记已记住' : '标记今日已读'}
          </button>
          <div className="ops-day-nav">
            <button
              type="button"
              className="btn"
              disabled={!prev}
              onClick={() => prev && setDay(prev.day)}
            >
              上一天
            </button>
            <button
              type="button"
              className="btn"
              disabled={!next}
              onClick={() => next && setDay(next.day)}
            >
              下一天
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
