'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { GeneratedPlan, GroupDetail, PlanSummary } from '@/lib/api';
import { groupDetailTodayLine } from '@/lib/group_status';
import { GroupMembersPanel } from './GroupMembersPanel';
import { GroupMemberNickname } from './GroupMemberNickname';
import { GroupCustomPlanPanel } from './GroupCustomPlanPanel';

type SettingsTab = 'group' | 'me' | 'admin';

type Props = {
  open: boolean;
  gid: string;
  detail: GroupDetail;
  isOwner: boolean;
  members: GroupDetail['members'];
  tasks: GroupDetail['tasks'];
  plans: PlanSummary[];
  generatedPlans: GeneratedPlan[];
  planScopes: { id: string; label: string }[];
  busy?: boolean;
  nameDraft: string;
  planDraft: string;
  announceDraft: string;
  onClose: () => void;
  onNameChange: (v: string) => void;
  onPlanChange: (v: string) => void;
  onAnnounceChange: (v: string) => void;
  onGeneratedPlansChange: (plans: GeneratedPlan[]) => void;
  onSaveSettings: () => void;
  onPinTask: (taskId: string) => void;
  onToggleMute: () => void;
  onDissolve: () => void;
  onMembersChanged: () => void;
};

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  if (value == null || value === '') return null;
  return (
    <div className="group-settings-info-row">
      <span className="muted group-settings-info-label">{label}</span>
      <span className="group-settings-info-value">{value}</span>
    </div>
  );
}

export function GroupSettingsSheet({
  open,
  gid,
  detail,
  isOwner,
  members = [],
  tasks = [],
  plans,
  generatedPlans,
  planScopes,
  busy,
  nameDraft,
  planDraft,
  announceDraft,
  onClose,
  onNameChange,
  onPlanChange,
  onAnnounceChange,
  onGeneratedPlansChange,
  onSaveSettings,
  onPinTask,
  onToggleMute,
  onDissolve,
  onMembersChanged,
}: Props) {
  const [tab, setTab] = useState<SettingsTab>('group');

  const tabs = useMemo(() => {
    const items: { id: SettingsTab; label: string }[] = [
      { id: 'group', label: '本群' },
      { id: 'me', label: '我的' },
    ];
    if (isOwner) items.push({ id: 'admin', label: '管理' });
    return items;
  }, [isOwner]);

  useEffect(() => {
    if (open) setTab('group');
  }, [open, gid]);

  if (!open) return null;

  const memberCount = members.length;
  const allPlanOptions = [
    ...plans.map((p) => ({ id: p.plan_id, title: p.title, tag: '精选' })),
    ...generatedPlans.map((p) => ({ id: p.id, title: p.title, tag: '定制' })),
  ];

  const planProgress =
    detail.plan_id && (detail.plan_days_total ?? 0) > 0
      ? `计划进度 · 我第 ${detail.my_plan_day ?? 0}/${detail.plan_days_total} 天${
          detail.plan_progress_pct != null ? ` · 群均 ${detail.plan_progress_pct}%` : ''
        }`
      : null;

  return (
    <div className="sheet-backdrop group-settings-backdrop" onClick={onClose}>
      <div
        className="sheet card group-settings-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="群设置"
      >
        <div className="half-sheet-grab" aria-hidden />
        <div className="section-row group-settings-sheet-head">
          <strong>群设置</strong>
          <button type="button" className="text-link" onClick={onClose}>
            关闭
          </button>
        </div>

        <div className="group-settings-tabs" role="tablist" aria-label="群设置分类">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`group-settings-tab${tab === t.id ? ' active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'group' && (
          <section className="group-settings-panel" role="tabpanel" aria-label="本群">
            <div className="group-settings-info-card card card-2">
              <InfoRow label="群名称" value={detail.name} />
              <InfoRow label="成员" value={`${memberCount} 人 · ${groupDetailTodayLine(detail)}`} />
              {detail.plan_title && (
                <InfoRow label="共读计划" value={detail.plan_title} />
              )}
              {planProgress && <InfoRow label="进度" value={planProgress} />}
              {detail.intro?.trim() && (
                <InfoRow label="简介" value={detail.intro.trim()} />
              )}
              {detail.announcement?.trim() ? (
                <InfoRow label="公告" value={detail.announcement.trim()} />
              ) : (
                <InfoRow label="公告" value={<span className="muted">暂无公告</span>} />
              )}
            </div>
            <div className="group-settings-members-wrap">
              <GroupMembersPanel
                gid={gid}
                members={members}
                isOwner={isOwner}
                joinCode={isOwner ? detail.join_code : undefined}
                planDaysTotal={detail.plan_days_total}
                onChanged={onMembersChanged}
              />
            </div>
          </section>
        )}

        {tab === 'me' && (
          <section className="group-settings-panel" role="tabpanel" aria-label="我的">
            <div className="group-settings-me-card card card-2">
              <GroupMemberNickname gid={gid} members={members} onChanged={onMembersChanged} />
              <button
                type="button"
                className="group-settings-row-btn"
                disabled={busy}
                onClick={onToggleMute}
              >
                <span>{detail.muted ? '本群提醒已关闭' : '本群提醒已开启'}</span>
                <span className="muted">{detail.muted ? '开启' : '关闭'}</span>
              </button>
            </div>
          </section>
        )}

        {tab === 'admin' && isOwner && (
          <section className="group-settings-panel" role="tabpanel" aria-label="管理">
            <div className="group-settings-admin-card card card-2">
              <label className="group-composer-label" htmlFor="gs-name">
                群名称
              </label>
              <input
                id="gs-name"
                className="search-input"
                value={nameDraft}
                onChange={(e) => onNameChange(e.target.value)}
                placeholder="修改群名称"
              />

              <label className="group-composer-label" htmlFor="gs-announce" style={{ marginTop: 12 }}>
                群公告
              </label>
              <textarea
                id="gs-announce"
                className="group-composer-text"
                rows={3}
                placeholder="发布群公告（全员可见）"
                value={announceDraft}
                onChange={(e) => onAnnounceChange(e.target.value)}
              />

              <label className="group-composer-label" htmlFor="gs-plan" style={{ marginTop: 12 }}>
                绑定读经计划
              </label>
              <select
                id="gs-plan"
                className="search-input"
                value={planDraft}
                onChange={(e) => onPlanChange(e.target.value)}
              >
                <option value="">不绑定计划</option>
                {allPlanOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    [{p.tag}] {p.title}
                  </option>
                ))}
              </select>

              <GroupCustomPlanPanel
                planScopes={planScopes}
                busy={busy}
                onPlanSelected={onPlanChange}
                onGeneratedPlansChange={onGeneratedPlansChange}
              />

              {tasks.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <span className="group-composer-label">置顶任务</span>
                  <div className="group-pin-list">
                    {tasks.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className={`group-pin-item${t.pinned ? ' active' : ''}`}
                        disabled={busy}
                        onClick={() => onPinTask(t.id)}
                      >
                        {t.pinned ? '📌 ' : ''}
                        {t.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="button"
                className="btn btn-block"
                style={{ marginTop: 16 }}
                disabled={busy}
                onClick={onSaveSettings}
              >
                {busy ? '保存中…' : '保存设置'}
              </button>
            </div>

            <div className="group-settings-danger-block">
              <button
                type="button"
                className="font-pill danger-pill btn-block"
                disabled={busy}
                onClick={onDissolve}
              >
                解散共读群
              </button>
              <p className="muted group-settings-hint" style={{ marginTop: 8, textAlign: 'center' }}>
                解散后所有成员将无法继续打卡，此操作不可恢复
              </p>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
