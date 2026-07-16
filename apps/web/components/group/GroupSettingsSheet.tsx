'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { api, type GeneratedPlan, type GroupDetail, type PlanSummary } from '@/lib/api';
import { groupDetailTodayLine } from '@/lib/group_status';
import { GroupMembersPanel } from './GroupMembersPanel';
import { GroupMemberNickname } from './GroupMemberNickname';
import { GroupCustomPlanPanel } from './GroupCustomPlanPanel';

export type GroupSettingsPane =
  | 'home'
  | 'profile'
  | 'nickname'
  | 'notify'
  | 'members'
  | 'plan'
  | 'admin';

type Props = {
  open: boolean;
  gid: string;
  detail: GroupDetail;
  isOwner: boolean;
  isStaff?: boolean;
  members: GroupDetail['members'];
  tasks: GroupDetail['tasks'];
  plans: PlanSummary[];
  generatedPlans: GeneratedPlan[];
  busy?: boolean;
  nameDraft: string;
  planDraft: string;
  announceDraft: string;
  initialPane?: GroupSettingsPane;
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
  onDetailChanged?: () => void;
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

function NavRow({
  label,
  hint,
  onClick,
  danger,
}: {
  label: string;
  hint?: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={`group-settings-nav-row${danger ? ' is-danger' : ''}`}
      onClick={onClick}
    >
      <span>{label}</span>
      <span className="muted">{hint || '›'}</span>
    </button>
  );
}

export function GroupSettingsSheet({
  open,
  gid,
  detail,
  isOwner,
  isStaff,
  members = [],
  tasks = [],
  plans,
  generatedPlans,
  busy,
  nameDraft,
  planDraft,
  announceDraft,
  initialPane = 'home',
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
  onDetailChanged,
}: Props) {
  const [pane, setPane] = useState<GroupSettingsPane>('home');
  const [chatBusy, setChatBusy] = useState(false);
  const [chatErr, setChatErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) setPane(initialPane || 'home');
  }, [open, initialPane]);

  if (!open) return null;

  const allowChat = detail.allow_chat !== false;
  const canManagePlan = Boolean(isStaff || isOwner);
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

  const toggleAllowChat = async () => {
    setChatBusy(true);
    setChatErr(null);
    try {
      await api.setAllowChat(gid, !allowChat);
      onDetailChanged?.();
      onMembersChanged();
    } catch (e) {
      setChatErr(e instanceof Error ? e.message : String(e));
    } finally {
      setChatBusy(false);
    }
  };

  const title =
    pane === 'home'
      ? '群设置'
      : pane === 'profile'
        ? '群资料'
        : pane === 'nickname'
          ? '本群昵称'
          : pane === 'notify'
            ? '消息与提醒'
            : pane === 'members'
              ? '成员与邀请'
              : pane === 'plan'
                ? '群计划'
                : '群管理';

  const goBack = () => {
    if (pane === 'home') onClose();
    else setPane('home');
  };

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
          <button type="button" className="text-link" onClick={goBack}>
            {pane === 'home' ? '关闭' : '返回'}
          </button>
          <strong>{title}</strong>
          <span style={{ width: 36 }} aria-hidden />
        </div>

        {pane === 'home' ? (
          <nav className="group-settings-nav" aria-label="设置目录">
            <NavRow label="群资料" hint={detail.name} onClick={() => setPane('profile')} />
            <NavRow label="本群昵称" onClick={() => setPane('nickname')} />
            <NavRow
              label="消息与提醒"
              hint={detail.muted ? '已关闭' : '已开启'}
              onClick={() => setPane('notify')}
            />
            <NavRow
              label="成员与邀请"
              hint={`${memberCount} 人`}
              onClick={() => setPane('members')}
            />
            {canManagePlan ? (
              <>
                <NavRow
                  label="群计划"
                  hint={detail.plan_title || '未绑定'}
                  onClick={() => setPane('plan')}
                />
                <NavRow label="群管理" onClick={() => setPane('admin')} />
              </>
            ) : null}
            {isOwner ? (
              <NavRow label="解散本群" danger onClick={onDissolve} />
            ) : null}
          </nav>
        ) : null}

        {pane === 'profile' ? (
          <section className="group-settings-section">
            <div className="group-settings-info-card card card-2">
              <InfoRow label="群名称" value={detail.name} />
              {detail.plan_title && <InfoRow label="共读计划" value={detail.plan_title} />}
              {planProgress && <InfoRow label="进度" value={planProgress} />}
              {detail.intro?.trim() && <InfoRow label="简介" value={detail.intro.trim()} />}
              {detail.announcement?.trim() ? (
                <InfoRow label="公告" value={detail.announcement.trim()} />
              ) : (
                <InfoRow label="公告" value={<span className="muted">暂无公告</span>} />
              )}
              <InfoRow label="今日" value={groupDetailTodayLine(detail)} />
            </div>
            {isOwner ? (
              <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
                修改群名与公告请到「群管理」
              </p>
            ) : null}
          </section>
        ) : null}

        {pane === 'nickname' ? (
          <section className="group-settings-section">
            <div className="group-settings-me-card card card-2">
              <GroupMemberNickname gid={gid} members={members} onChanged={onMembersChanged} />
            </div>
          </section>
        ) : null}

        {pane === 'notify' ? (
          <section className="group-settings-section">
            <div className="group-settings-me-card card card-2">
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
        ) : null}

        {pane === 'members' ? (
          <section className="group-settings-section group-settings-section-members">
            <h3 className="group-settings-section-title">
              成员 · {memberCount} 人 · {groupDetailTodayLine(detail)}
            </h3>
            <GroupMembersPanel
              gid={gid}
              members={members}
              isOwner={isOwner}
              joinCode={detail.join_code}
              groupName={detail.name}
              planDaysTotal={detail.plan_days_total}
              inviteIntro={detail.intro}
              invitePlanTitle={detail.plan_title}
              invitePlanDayLine={
                detail.plan_title
                  ? detail.plan_days_total
                    ? `${detail.plan_title} · 我第 ${detail.my_plan_day ?? 0}/${detail.plan_days_total} 天`
                    : detail.plan_title
                  : null
              }
              inviteCheckedInToday={detail.checked_in_today}
              variant="grid"
              onChanged={onMembersChanged}
            />
          </section>
        ) : null}

        {pane === 'plan' && canManagePlan ? (
          <section className="group-settings-section">
            <div className="group-settings-admin-card card card-2">
              <label className="group-composer-label" htmlFor="gs-plan">
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
                busy={busy}
                onPlanSelected={onPlanChange}
                onGeneratedPlansChange={onGeneratedPlansChange}
              />
              <button
                type="button"
                className="btn btn-block"
                style={{ marginTop: 16 }}
                disabled={busy}
                onClick={onSaveSettings}
              >
                {busy ? '保存中…' : '保存'}
              </button>
            </div>
          </section>
        ) : null}

        {pane === 'admin' && canManagePlan ? (
          <section className="group-settings-section">
            <div className="group-settings-admin-card card card-2">
              {isOwner ? (
                <>
                  <button
                    type="button"
                    className="group-settings-row-btn"
                    disabled={busy || chatBusy}
                    onClick={() => void toggleAllowChat()}
                  >
                    <span>{allowChat ? '群闲聊已开启' : '群闲聊已关闭'}</span>
                    <span className="muted">{chatBusy ? '…' : allowChat ? '关闭' : '开启'}</span>
                  </button>
                  {chatErr ? <p className="group-composer-err">{chatErr}</p> : null}
                  <p className="muted" style={{ fontSize: 12, margin: '4px 0 12px', lineHeight: 1.45 }}>
                    关闭后成员仍可打卡、发任务与图片文件，不可发闲聊文字。
                  </p>
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
                </>
              ) : null}

              <label className="group-composer-label" htmlFor="gs-announce" style={{ marginTop: isOwner ? 12 : 0 }}>
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
          </section>
        ) : null}
      </div>
    </div>
  );
}
