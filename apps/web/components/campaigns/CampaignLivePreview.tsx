'use client';

import type { OpsCampaignLanding } from '@/lib/api';
import { resolvePrimaryCta } from '@/lib/campaign_nav';

/** 配置页右侧实时预览（手机框） */
export function CampaignLivePreview({
  name,
  subtitle,
  templateId,
  campaignId,
  landing,
  railEnabled,
  railSlot,
}: {
  name: string;
  subtitle?: string;
  templateId: string;
  campaignId?: string;
  landing: OpsCampaignLanding;
  railEnabled?: boolean;
  railSlot?: number;
}) {
  const title = (landing.title || name || '活动标题').trim() || '活动标题';
  const body = (landing.body || '').trim();
  const days = landing.days || [];
  const cta = resolvePrimaryCta(templateId, campaignId, landing.primaryCta);
  const schedule = landing.schedule;
  const slots = (landing.slots || []).filter((s) => (s.title || '').trim());
  const entries = (landing.entries || []).filter(
    (e) => (e.title || '').trim() && (e.href || '').trim(),
  );

  return (
    <aside className="ops-preview-panel" aria-label="实时预览">
      <div className="ops-preview-head">
        <strong>实时预览</strong>
        <span className="muted">成员端大致效果</span>
      </div>
      {railEnabled !== false ? (
        <div className="ops-preview-rail">
          <span className="pill">今日推荐 · 第 {railSlot || 1} 位</span>
          <strong>{name.trim() || title}</strong>
          <span className="muted">{subtitle?.trim() || body.slice(0, 36) || '副文案'}</span>
        </div>
      ) : (
        <p className="muted" style={{ fontSize: 12, margin: '0 0 10px' }}>
          未挂今日推荐
        </p>
      )}
      <div className="ops-preview-phone">
        <div className="ops-preview-phone-bar" aria-hidden />
        <div className="ops-preview-phone-body">
          <span className="pill">活动</span>
          <h2 className="ops-preview-title">{title}</h2>
          {body ? <p className="ops-preview-body">{body}</p> : (
            <p className="muted" style={{ fontSize: 13 }}>说明文案将显示在这里</p>
          )}

          {schedule && ((schedule.location || '').trim() || (schedule.startsAt || '').trim()) ? (
            <div className="ops-preview-block">
              <strong>聚会信息</strong>
              {(schedule.startsAt || '').trim() ? (
                <span className="muted">{new Date(schedule.startsAt!).toLocaleString('zh-CN')}</span>
              ) : null}
              {(schedule.location || '').trim() ? <span>{schedule.location}</span> : null}
              {(schedule.onlineNote || '').trim() ? (
                <span className="muted">{schedule.onlineNote}</span>
              ) : null}
            </div>
          ) : null}

          {days.length > 0 ? (
            <div className="ops-preview-block">
              <strong>日课 · {days.length} 天</strong>
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
          ) : null}

          {slots.length > 0 ? (
            <div className="ops-preview-block">
              <strong>岗位</strong>
              {slots.map((s) => (
                <div key={s.id} className="ops-preview-row">
                  <span>{s.title}</span>
                  <span className="muted">名额 {s.limit}</span>
                </div>
              ))}
            </div>
          ) : null}

          {entries.length > 0 ? (
            <div className="ops-preview-block">
              <strong>入口</strong>
              {entries.map((e) => (
                <div key={e.id || e.href} className="ops-preview-row">
                  <span>{e.title}</span>
                  <span className="muted">{e.sub || e.href}</span>
                </div>
              ))}
            </div>
          ) : null}

          <button type="button" className="btn btn-primary ops-preview-cta" disabled>
            {cta.label}
          </button>
        </div>
      </div>
    </aside>
  );
}
