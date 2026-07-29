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

export type CampaignPreviewEditTarget =
  | { kind: 'home-card' }
  | { kind: 'landing-title' }
  | { kind: 'block'; blockId: string }
  | { kind: 'days'; day?: number }
  | { kind: 'cta' };

function isSelfLandingHref(href: string, campaignId?: string): boolean {
  if (!campaignId) return false;
  const path = `/campaigns/view/${campaignId}`;
  const raw = (href || '').trim();
  return raw === path || raw.startsWith(`${path}?`) || raw.startsWith(`${path}#`);
}

function ctaOpensInPageReading(templateId: string, href: string, campaignId?: string): boolean {
  if (templateId === 'multi_day' || templateId === 'memory') return true;
  return isSelfLandingHref(href, campaignId);
}

function homeRailCardClass(c: RailCard): string {
  return [
    'rail-card',
    'rail-card-content',
    'card',
    `card-${c.kind}`,
    `card-tint-${c.tint}`,
    `rail-card-layout-${c.layout}`,
    c.kind === 'action' ? 'card-3 card-tint card-accent rail-card-action' : 'card-2 card-tint',
    'rail-card-active',
  ]
    .filter(Boolean)
    .join(' ');
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
  onEdit,
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
  onEdit?: (target: CampaignPreviewEditTarget) => void;
}) {
  const [tab, setTab] = useState<PreviewTab>(railEnabled === false ? 'landing' : 'home');
  const [device, setDevice] = useState<PreviewDevice>('phone');
  const [previewDay, setPreviewDay] = useState(1);
  const title = (landing.title || name || '活动标题').trim() || '活动标题';
  const cta = resolvePrimaryCta(templateId, campaignId, landing.primaryCta);
  const inPageReading = ctaOpensInPageReading(templateId, cta.href, campaignId);
  const days = landing.days || [];

  const railCard: RailCard = {
    id: campaignId ? `campaign-${campaignId}` : 'campaign-preview',
    kind: 'action',
    tint: 'gold',
    layout: 'cover',
    tag: tag || '活动',
    reason: '群活动',
    title: trimRailTitle(name.trim() || title),
    sub: trimRailSub(subtitle?.trim() || '继续阅读'),
    href: '#preview-landing',
    icon: RAIL_ICONS.campaign,
    bookId: 'GEN',
  };

  const copyPreviewLink = async () => {
    if (!campaignId) {
      onHint?.('保存草稿后可复制预览链');
      return;
    }
    const ok = await copyText(campaignPreviewUrl(campaignId));
    onHint?.(ok ? '预览链已复制（带 preview=1）' : '复制失败');
  };

  const edit = (target: CampaignPreviewEditTarget, hint?: string) => {
    onEdit?.(target);
    if (hint) onHint?.(hint);
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
        <div className="ops-preview-home home-page">
          {railEnabled === false ? (
            <p className="muted" style={{ fontSize: 12, margin: '0 0 10px' }}>
              未挂今日推荐；成员需通过链接进入落地页。点击卡片可改曝光设置。
            </p>
          ) : (
            <p className="muted" style={{ fontSize: 12, margin: '0 0 10px' }}>
              与首页「今日推荐」同款 · 第 {railSlot || 1} 位 · 点击可编辑
            </p>
          )}
          <div className="rail home-rail ops-preview-home-rail" aria-label="首页今日推荐示意">
            <button
              type="button"
              className={homeRailCardClass(railCard)}
              style={{ ['--tint' as string]: 'var(--dawn-gold)' }}
              onClick={() => edit({ kind: 'home-card' }, '已打开设置：活动名称 / 副文案 / 曝光')}
              title="点击编辑首页卡片文案与曝光"
            >
              <RailCardVisual card={railCard} />
              <div className="rail-card-body rail-card-body-padded">
                <div className="rail-head">
                  <span className="pill pill-active">{railCard.tag}</span>
                </div>
                <div className="rail-title">{railCard.title}</div>
                {railCard.sub ? (
                  <div className="rail-foot">
                    <span className="rail-sub">{railCard.sub}</span>
                  </div>
                ) : null}
              </div>
            </button>
          </div>
        </div>
      ) : (
        <div className={device === 'phone' ? 'ops-preview-phone' : 'ops-preview-desktop'}>
          {device === 'phone' ? <div className="ops-preview-phone-bar" aria-hidden /> : null}
          <div className={device === 'phone' ? 'ops-preview-phone-body' : 'ops-preview-desktop-body'}>
            {tab === 'landing' ? (
              <>
                <button
                  type="button"
                  className="ops-preview-title ops-preview-editable"
                  onClick={() => edit({ kind: 'landing-title' }, '已打开设置：活动名称')}
                  title="点击编辑标题"
                >
                  {title}
                </button>
                <p className="muted" style={{ fontSize: 12, margin: '0 0 8px' }}>
                  点击任意区块可编辑对应内容
                </p>
                <CampaignLandingBlocks
                  landing={landing}
                  templateId={templateId}
                  campaignId={campaignId}
                  mode="preview"
                  tag={tag}
                  onEditBlock={(blockId) =>
                    edit({ kind: 'block', blockId }, '已选中控件，可在「配置」中修改')
                  }
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
                onEditDays={(day) =>
                  edit({ kind: 'days', day }, '已打开日课配置')
                }
                onEditTitle={() => edit({ kind: 'landing-title' }, '已打开设置：活动名称')}
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
  onEditDays,
  onEditTitle,
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
  onEditDays?: (day?: number) => void;
  onEditTitle?: () => void;
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
        <button
          type="button"
          className="ops-preview-href ops-preview-editable"
          onClick={() => onEditDays?.()}
          title="点击编辑主按钮"
        >
          {ctaHref || '（未设置）'}
        </button>
      </div>
    );
  }

  if (!days.length) {
    return (
      <div className="ops-preview-reading">
        <button type="button" className="text-link" style={{ fontSize: 12 }} onClick={onBack}>
          ← 返回落地页
        </button>
        <button
          type="button"
          className="ops-preview-title ops-preview-editable"
          style={{ marginTop: 8 }}
          onClick={() => onEditTitle?.()}
        >
          {title}
        </button>
        <button
          type="button"
          className="muted ops-preview-editable"
          style={{ fontSize: 13, display: 'block', textAlign: 'left', marginTop: 8 }}
          onClick={() => onEditDays?.()}
        >
          还没有日课。点击此处添加日课内容。
        </button>
      </div>
    );
  }

  return (
    <div className="ops-preview-reading">
      <button type="button" className="text-link" style={{ fontSize: 12 }} onClick={onBack}>
        ← 返回落地页
      </button>
      <p className="ops-preview-reading-hint">
        成员点「{ctaLabel}」后的阅读布局 · 点击下文可编辑日课
      </p>
      <button
        type="button"
        className="ops-preview-title ops-preview-editable"
        onClick={() => onEditTitle?.()}
        title="点击编辑标题"
      >
        {title}
      </button>
      <div className="ops-progress" style={{ margin: '4px 0 10px' }}>
        <div className="ops-progress-track" aria-hidden>
          <div className="ops-progress-fill" style={{ width: '0%' }} />
        </div>
        <span className="ops-progress-label">已完成 0/{days.length}（示意）</span>
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
            onClick={() => {
              setDay(d.day);
              onEditDays?.(d.day);
            }}
            title={`编辑第 ${d.day} 天`}
          >
            {d.day}
          </button>
        ))}
      </div>
      {current ? (
        <button
          type="button"
          className="card ops-preview-editable"
          style={{ padding: 14, marginTop: 8, width: '100%', textAlign: 'left' }}
          onClick={() => onEditDays?.(current.day)}
          title="点击编辑本日内容"
        >
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
          <div className="btn btn-primary" style={{ marginTop: 12, width: '100%', pointerEvents: 'none' }}>
            {isMemory ? '标记已记住' : '标记今日已读'}
          </div>
          <div className="ops-day-nav" style={{ pointerEvents: 'none' }}>
            <span className="btn" style={{ opacity: prev ? 1 : 0.45 }}>
              上一天
            </span>
            <span className="btn" style={{ opacity: next ? 1 : 0.45 }}>
              下一天
            </span>
          </div>
        </button>
      ) : null}
    </div>
  );
}
