'use client';

import { useState } from 'react';
import type { OpsCampaignLanding } from '@/lib/api';
import {
  BLOCK_CATALOG,
  normalizeBlocks,
  type OpsLandingBlock,
} from '@/lib/campaign_blocks';
import { resolvePrimaryCta } from '@/lib/campaign_nav';

type TabItem = { id: string; label: string; body: string };

function asTabs(data?: Record<string, unknown>): TabItem[] {
  const raw = data?.tabs;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t, i) => {
      if (!t || typeof t !== 'object') return null;
      const r = t as Record<string, unknown>;
      return {
        id: String(r.id || `t${i}`),
        label: String(r.label || `标签 ${i + 1}`),
        body: String(r.body || ''),
      };
    })
    .filter(Boolean) as TabItem[];
}

/** 按积木顺序渲染落地页内容（预览 / 正式页共用） */
export function CampaignLandingBlocks({
  landing,
  templateId,
  campaignId,
  mode = 'view',
  tag,
  /** 仅渲染这些类型；默认全部 */
  onlyTypes,
  /** 预览态点击主按钮（如切到「今日阅读」预览） */
  onCtaClick,
}: {
  landing: OpsCampaignLanding;
  templateId?: string;
  campaignId?: string;
  mode?: 'view' | 'preview';
  tag?: string;
  onlyTypes?: OpsLandingBlock['type'][];
  onCtaClick?: () => void;
}) {
  const blocks = normalizeBlocks(landing.blocks).filter((b) =>
    onlyTypes ? onlyTypes.includes(b.type) : true,
  );
  const cta = resolvePrimaryCta(templateId || '', campaignId, landing.primaryCta);
  const days = landing.days || [];
  const schedule = landing.schedule;
  const slots = (landing.slots || []).filter((s) => (s.title || '').trim());
  const entries = (landing.entries || []).filter(
    (e) => (e.title || '').trim() && (e.href || '').trim(),
  );
  const features = landing.features || {};

  if (!blocks.length) {
    return (
      <>
        {landing.body ? <p className="ops-view-body">{landing.body}</p> : null}
      </>
    );
  }

  return (
    <div className={`ops-landing-blocks${mode === 'preview' ? ' is-preview' : ''}`}>
      {mode === 'preview' && tag ? <span className="pill">{tag}</span> : null}
      {blocks.map((block) => (
        <BlockView
          key={block.id}
          block={block}
          landing={landing}
          days={days}
          schedule={schedule}
          slots={slots}
          entries={entries}
          features={features}
          ctaLabel={cta.label}
          mode={mode}
          onCtaClick={onCtaClick}
        />
      ))}
    </div>
  );
}

function BlockView({
  block,
  days,
  schedule,
  slots,
  entries,
  features,
  ctaLabel,
  mode,
  onCtaClick,
}: {
  block: OpsLandingBlock;
  landing: OpsCampaignLanding;
  days: NonNullable<OpsCampaignLanding['days']>;
  schedule: OpsCampaignLanding['schedule'];
  slots: NonNullable<OpsCampaignLanding['slots']>;
  entries: NonNullable<OpsCampaignLanding['entries']>;
  features: NonNullable<OpsCampaignLanding['features']>;
  ctaLabel: string;
  mode: 'view' | 'preview';
  onCtaClick?: () => void;
}) {
  const d = block.data || {};

  if (block.type === 'text') {
    const heading = String(d.heading || '').trim();
    const body = String(d.body || '').trim();
    if (!heading && !body) {
      return mode === 'preview' ? (
        <p className="muted" style={{ fontSize: 13 }}>
          文本控件（待填写）
        </p>
      ) : null;
    }
    return (
      <div className="ops-lb-text">
        {heading ? <h3 className="ops-lb-heading">{heading}</h3> : null}
        {body ? <p className="ops-lb-body">{body}</p> : null}
      </div>
    );
  }

  if (block.type === 'audio') {
    const src = String(d.src || '').trim();
    const title = String(d.title || '').trim();
    const caption = String(d.caption || '').trim();
    if (!src && mode === 'view') return null;
    return (
      <div className="ops-lb-audio card">
        {title ? <strong>{title}</strong> : <strong>{BLOCK_CATALOG.audio.label}</strong>}
        {src ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <audio controls src={src} preload="none" style={{ width: '100%', marginTop: 8 }} />
        ) : (
          <p className="muted" style={{ fontSize: 13, margin: '6px 0 0' }}>
            未设置音频地址
          </p>
        )}
        {caption ? <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>{caption}</p> : null}
      </div>
    );
  }

  if (block.type === 'image') {
    const url = String(d.url || '').trim();
    const caption = String(d.caption || '').trim();
    if (!url && mode === 'view') return null;
    return (
      <figure className="ops-lb-image">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={caption || '活动图片'} />
        ) : (
          <div className="ops-lb-image-ph muted">图片控件（待填 URL）</div>
        )}
        {caption ? <figcaption className="muted">{caption}</figcaption> : null}
      </figure>
    );
  }

  if (block.type === 'divider') {
    return d.style === 'space' ? (
      <div className="ops-lb-space" aria-hidden />
    ) : (
      <hr className="ops-lb-divider" />
    );
  }

  if (block.type === 'verse') {
    const ref = String(d.ref || '').trim();
    const note = String(d.note || '').trim();
    if (!ref && mode === 'view') return null;
    return (
      <blockquote className="ops-lb-verse">
        <strong>{ref || '经文引用'}</strong>
        {note ? <p>{note}</p> : null}
      </blockquote>
    );
  }

  if (block.type === 'tabs') {
    return <TabsBlock data={d} mode={mode} />;
  }

  if (block.type === 'schedule') {
    const has =
      (schedule?.location || '').trim() ||
      (schedule?.startsAt || '').trim() ||
      (schedule?.onlineNote || '').trim();
    if (!has) {
      return mode === 'preview' ? (
        <p className="muted" style={{ fontSize: 13 }}>
          聚会日程（待填写）
        </p>
      ) : null;
    }
    return (
      <div className="ops-preview-block ops-lb-card">
        <strong>{BLOCK_CATALOG.schedule.label}</strong>
        {(schedule?.startsAt || '').trim() ? (
          <span className="muted">{new Date(schedule!.startsAt!).toLocaleString('zh-CN')}</span>
        ) : null}
        {(schedule?.location || '').trim() ? <span>{schedule!.location}</span> : null}
        {(schedule?.onlineNote || '').trim() ? (
          <span className="muted">{schedule!.onlineNote}</span>
        ) : null}
      </div>
    );
  }

  if (block.type === 'days') {
    if (!days.length) {
      return mode === 'preview' ? (
        <p className="muted" style={{ fontSize: 13 }}>
          日课列表（待添加）
        </p>
      ) : null;
    }
    return (
      <div className="ops-preview-block ops-lb-card">
        <strong>
          {BLOCK_CATALOG.days.label} · {days.length} 天
        </strong>
        <ol className="ops-preview-days">
          {days.slice(0, mode === 'preview' ? 5 : 99).map((day, i) => (
            <li key={day.day || i}>
              <span>第 {day.day || i + 1} 天</span>
              <span className="muted">
                {(day.title || '').trim() ||
                  ((day.verseRef || '').trim() ? day.verseRef : '待填写')}
              </span>
            </li>
          ))}
          {mode === 'preview' && days.length > 5 ? (
            <li className="muted">…还有 {days.length - 5} 天</li>
          ) : null}
        </ol>
      </div>
    );
  }

  if (block.type === 'slots') {
    if (!slots.length) {
      return mode === 'preview' ? (
        <p className="muted" style={{ fontSize: 13 }}>
          岗位报名（待添加）
        </p>
      ) : null;
    }
    return (
      <div className="ops-preview-block ops-lb-card">
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

  if (block.type === 'entries') {
    if (!entries.length) {
      return mode === 'preview' ? (
        <p className="muted" style={{ fontSize: 13 }}>
          入口卡片（待添加）
        </p>
      ) : null;
    }
    return (
      <div className="ops-preview-block ops-lb-card">
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

  if (block.type === 'engage') {
    const bits = [
      features.likes ? '点赞' : null,
      features.comments ? '评论' : null,
      features.rsvp ? 'RSVP' : null,
      features.prayer ? '代祷' : null,
      features.questions ? '提问' : null,
    ].filter(Boolean);
    if (!bits.length && mode === 'view') return null;
    return (
      <div className="ops-preview-block ops-lb-card">
        <strong>{BLOCK_CATALOG.engage.label}</strong>
        <span className="muted">{bits.length ? bits.join(' · ') : '未开启互动'}</span>
      </div>
    );
  }

  if (block.type === 'cta') {
    const clickable = mode === 'preview' && Boolean(onCtaClick);
    return (
      <button
        type="button"
        className={`btn btn-primary ops-preview-cta${clickable ? ' is-clickable' : ''}`}
        disabled={mode === 'preview' && !onCtaClick}
        onClick={clickable ? onCtaClick : undefined}
      >
        {ctaLabel}
      </button>
    );
  }

  return null;
}

function TabsBlock({
  data,
  mode,
}: {
  data: Record<string, unknown>;
  mode: 'view' | 'preview';
}) {
  const tabs = asTabs(data);
  const [active, setActive] = useState(tabs[0]?.id || '');
  if (!tabs.length) {
    return mode === 'preview' ? (
      <p className="muted" style={{ fontSize: 13 }}>
        Tab 分组（待配置）
      </p>
    ) : null;
  }
  const cur = tabs.find((t) => t.id === active) || tabs[0];
  return (
    <div className="ops-lb-tabs">
      <div className="ops-lb-tablist" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={cur.id === t.id}
            className={`ops-lb-tab${cur.id === t.id ? ' is-on' : ''}`}
            onClick={() => setActive(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="ops-lb-tabpanel" role="tabpanel">
        {cur.body.trim() ? (
          <p className="ops-lb-body">{cur.body}</p>
        ) : (
          <p className="muted" style={{ fontSize: 13 }}>
            此标签暂无内容
          </p>
        )}
      </div>
    </div>
  );
}
