'use client';

import { useState } from 'react';
import type { OpsCampaignLanding } from '@/lib/api';
import { resolvePrimaryCta } from '@/lib/campaign_nav';
import { BLOCK_CATALOG, type OpsBlockType } from '@/lib/campaign_blocks';
import { RAIL_ICONS, trimRailSub, trimRailTitle, type RailCard } from '@/lib/home_rail';
import { RailCardVisual } from '@/components/home/RailCardVisual';

type PreviewTab = 'home' | 'landing';

/** 配置页右侧实时预览：首页卡 + 落地页 */
export function CampaignLivePreview({
  name,
  subtitle,
  tag,
  templateId,
  campaignId,
  landing,
  railEnabled,
  railSlot,
}: {
  name: string;
  subtitle?: string;
  tag?: string;
  templateId: string;
  campaignId?: string;
  landing: OpsCampaignLanding;
  railEnabled?: boolean;
  railSlot?: number;
}) {
  const [tab, setTab] = useState<PreviewTab>(railEnabled === false ? 'landing' : 'home');
  const title = (landing.title || name || '活动标题').trim() || '活动标题';
  const body = (landing.body || '').trim();
  const days = landing.days || [];
  const cta = resolvePrimaryCta(templateId, campaignId, landing.primaryCta);
  const schedule = landing.schedule;
  const slots = (landing.slots || []).filter((s) => (s.title || '').trim());
  const entries = (landing.entries || []).filter(
    (e) => (e.title || '').trim() && (e.href || '').trim(),
  );
  const features = landing.features || {};
  const blocks = landing.blocks || [];

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

  const orderedTypes: OpsBlockType[] =
    blocks.length > 0
      ? (blocks.map((b) => b.type) as OpsBlockType[])
      : ([
          days.length ? 'days' : null,
          schedule ? 'schedule' : null,
          slots.length ? 'slots' : null,
          entries.length ? 'entries' : null,
          'cta',
        ].filter(Boolean) as OpsBlockType[]);

  return (
    <aside className="ops-preview-panel" aria-label="实时预览">
      <div className="ops-preview-head">
        <strong>实时预览</strong>
        <span className="muted">点卡片可看落地页</span>
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
        <div className="ops-preview-phone">
          <div className="ops-preview-phone-bar" aria-hidden />
          <div className="ops-preview-phone-body">
            <span className="pill">{tag || '活动'}</span>
            <h2 className="ops-preview-title">{title}</h2>
            {body ? (
              <p className="ops-preview-body">{body}</p>
            ) : (
              <p className="muted" style={{ fontSize: 13 }}>
                说明文案将显示在这里
              </p>
            )}

            {orderedTypes.map((type) => {
              if (type === 'schedule' && schedule) {
                const has =
                  (schedule.location || '').trim() ||
                  (schedule.startsAt || '').trim() ||
                  (schedule.onlineNote || '').trim();
                if (!has) return null;
                return (
                  <div key="schedule" className="ops-preview-block">
                    <strong>{BLOCK_CATALOG.schedule.label}</strong>
                    {(schedule.startsAt || '').trim() ? (
                      <span className="muted">
                        {new Date(schedule.startsAt!).toLocaleString('zh-CN')}
                      </span>
                    ) : null}
                    {(schedule.location || '').trim() ? <span>{schedule.location}</span> : null}
                    {(schedule.onlineNote || '').trim() ? (
                      <span className="muted">{schedule.onlineNote}</span>
                    ) : null}
                  </div>
                );
              }
              if (type === 'days' && days.length > 0) {
                return (
                  <div key="days" className="ops-preview-block">
                    <strong>
                      {BLOCK_CATALOG.days.label} · {days.length} 天
                    </strong>
                    <ol className="ops-preview-days">
                      {days.slice(0, 5).map((d, i) => (
                        <li key={d.day || i}>
                          <span>第 {d.day || i + 1} 天</span>
                          <span className="muted">
                            {(d.title || '').trim() ||
                              ((d.verseRef || '').trim() ? d.verseRef : '待填写')}
                          </span>
                        </li>
                      ))}
                      {days.length > 5 ? (
                        <li className="muted">…还有 {days.length - 5} 天</li>
                      ) : null}
                    </ol>
                  </div>
                );
              }
              if (type === 'slots' && slots.length > 0) {
                return (
                  <div key="slots" className="ops-preview-block">
                    <strong>{BLOCK_CATALOG.slots.label}</strong>
                    {slots.map((s) => (
                      <div key={s.id} className="ops-preview-row">
                        <span>{s.title}</span>
                        <span className="muted">名额 {s.limit}</span>
                      </div>
                    ))}
                  </div>
                );
              }
              if (type === 'entries' && entries.length > 0) {
                return (
                  <div key="entries" className="ops-preview-block">
                    <strong>{BLOCK_CATALOG.entries.label}</strong>
                    {entries.map((e) => (
                      <div key={e.id || e.href} className="ops-preview-row">
                        <span>{e.title}</span>
                        <span className="muted">{e.sub || e.href}</span>
                      </div>
                    ))}
                  </div>
                );
              }
              if (type === 'engage') {
                const bits = [
                  features.likes ? '点赞' : null,
                  features.comments ? '评论' : null,
                  features.rsvp ? 'RSVP' : null,
                  features.prayer ? '代祷' : null,
                  features.questions ? '提问' : null,
                ].filter(Boolean);
                if (!bits.length) return null;
                return (
                  <div key="engage" className="ops-preview-block">
                    <strong>{BLOCK_CATALOG.engage.label}</strong>
                    <span className="muted">{bits.join(' · ')}</span>
                  </div>
                );
              }
              if (type === 'cta') {
                return (
                  <button
                    key="cta"
                    type="button"
                    className="btn btn-primary ops-preview-cta"
                    disabled
                  >
                    {cta.label}
                  </button>
                );
              }
              return null;
            })}
          </div>
        </div>
      )}
    </aside>
  );
}
