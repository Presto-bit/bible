'use client';

import type { GroupDetail, PlanSummary } from '@/lib/api';
import { GroupMembersPanel } from './GroupMembersPanel';

type Props = {
  open: boolean;
  gid: string;
  detail: GroupDetail;
  isOwner: boolean;
  members: GroupDetail['members'];
  tasks: GroupDetail['tasks'];
  plans: PlanSummary[];
  busy?: boolean;
  nameDraft: string;
  planDraft: string;
  announceDraft: string;
  onClose: () => void;
  onNameChange: (v: string) => void;
  onPlanChange: (v: string) => void;
  onAnnounceChange: (v: string) => void;
  onSaveSettings: () => void;
  onPinTask: (taskId: string) => void;
  onToggleMute: () => void;
  onDissolve: () => void;
  onMembersChanged: () => void;
};

export function GroupSettingsSheet({
  open,
  gid,
  detail,
  isOwner,
  members = [],
  tasks = [],
  plans,
  busy,
  nameDraft,
  planDraft,
  announceDraft,
  onClose,
  onNameChange,
  onPlanChange,
  onAnnounceChange,
  onSaveSettings,
  onPinTask,
  onToggleMute,
  onDissolve,
  onMembersChanged,
}: Props) {
  if (!open) return null;

  return (
    <div className="sheet-backdrop group-settings-backdrop" onClick={onClose}>
      <div
        className="sheet card group-settings-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="half-sheet-grab" aria-hidden />
        <div className="section-row group-settings-sheet-head">
          <strong>群设置</strong>
          <button type="button" className="text-link" onClick={onClose}>
            关闭
          </button>
        </div>

        <div className="group-settings-section">
          <h3 className="group-settings-section-title">群成员</h3>
          <GroupMembersPanel
            gid={gid}
            members={members}
            isOwner={isOwner}
            joinCode={isOwner ? detail.join_code : undefined}
            planDaysTotal={detail.plan_days_total}
            onChanged={onMembersChanged}
          />
        </div>

        <div className="group-settings-section">
          <h3 className="group-settings-section-title">提醒</h3>
          <button type="button" className="group-settings-row-btn" disabled={busy} onClick={onToggleMute}>
            <span>{detail.muted ? '已关闭本群提醒' : '本群提醒已开启'}</span>
            <span className="muted">{detail.muted ? '开启' : '关闭'}</span>
          </button>
        </div>

        {isOwner && (
          <div className="group-settings-section">
            <h3 className="group-settings-section-title">群管理</h3>
            <label className="group-composer-label" htmlFor="gs-name">
              群名称
            </label>
            <input
              id="gs-name"
              className="search-input"
              value={nameDraft}
              onChange={(e) => onNameChange(e.target.value)}
            />
            <label className="group-composer-label" htmlFor="gs-plan" style={{ marginTop: 10 }}>
              绑定读经计划
            </label>
            <select
              id="gs-plan"
              className="search-input"
              value={planDraft}
              onChange={(e) => onPlanChange(e.target.value)}
            >
              <option value="">不绑定计划</option>
              {plans.map((p) => (
                <option key={p.plan_id} value={p.plan_id}>
                  {p.title}
                </option>
              ))}
            </select>
            <label className="group-composer-label" htmlFor="gs-announce" style={{ marginTop: 10 }}>
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
              className="btn"
              style={{ width: '100%', marginTop: 12 }}
              disabled={busy}
              onClick={onSaveSettings}
            >
              {busy ? '保存中…' : '保存设置'}
            </button>
            <button
              type="button"
              className="font-pill danger-pill"
              style={{ width: '100%', marginTop: 12 }}
              disabled={busy}
              onClick={onDissolve}
            >
              解散共读群
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
