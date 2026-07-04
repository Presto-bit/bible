'use client';

import type { GroupDetail } from '@/lib/api';
import { groupMemberCount } from '@/lib/group_ui';

type Props = {
  detail: GroupDetail;
  scrolled?: boolean;
  onShowMembers: () => void;
  onShowSettings?: () => void;
  onToggleMute?: () => void;
};

export function GroupHeaderBar({
  detail,
  scrolled,
  onShowMembers,
  onShowSettings,
  onToggleMute,
}: Props) {
  const isOwner = detail.role === 'owner';

  const todayRead =
    detail.plan_title && detail.my_plan_day
      ? `${detail.plan_title} · 第 ${detail.my_plan_day} 天`
      : detail.plan_title || '自由打卡群';

  return (
    <header className={`group-header group-header-v2 group-header-sticky${scrolled ? ' scrolled' : ''}`}>
      <div className="group-header-top">
        <div className="group-header-main">
          <div className="group-header-title-row">
            <h1>{detail.name}</h1>
            {detail.muted && (
              <span className="group-mute-icon" title="已关闭本群提醒" aria-label="已静音">
                🔕
              </span>
            )}
            {isOwner && <span className="group-owner-badge">群主</span>}
          </div>
          <p className="group-header-sub muted">
            <span className="group-header-stat">📖 {todayRead}</span>
          </p>
        </div>
        <div className="group-header-actions">
          <button type="button" className="group-members-link" onClick={onShowMembers}>
            成员 {groupMemberCount(detail)} ›
          </button>
          {onToggleMute && (
            <button type="button" className="icon-btn" aria-label="提醒设置" onClick={onToggleMute}>
              {detail.muted ? '🔕' : '🔔'}
            </button>
          )}
          {isOwner && onShowSettings && (
            <button type="button" className="icon-btn" aria-label="群设置" onClick={onShowSettings}>
              设置
            </button>
          )}
        </div>
      </div>
      {detail.join_code && (
        <p className="group-invite-hint muted">
          邀请码 <strong>{detail.join_code}</strong>
        </p>
      )}
    </header>
  );
}
