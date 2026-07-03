'use client';

import { useMemo, useState } from 'react';
import type { GroupDetail, GroupMessage } from '@/lib/api';
import { buildCheckinPosters, posterBodyPreview, posterTimeLabel } from '@/lib/group_checkin_wall';
import { groupDetailTodayLine } from '@/lib/group_status';
import { displayMemberName, localDayKey, memberAvatarInitial } from '@/lib/group_ui';
import { isWallUnread, markWallRead } from '@/lib/group_wall_read';
import { formatGroupRefLabel } from '@/lib/ref_label';
import { readerHrefFromRef } from '@/lib/group_footprint';

type Props = {
  groupId: string;
  detail: GroupDetail;
  messages: GroupMessage[];
  isOwner?: boolean;
  onOpenMembers?: () => void;
};

export function GroupCheckinWall({
  groupId,
  detail,
  messages,
  isOwner,
  onOpenMembers,
}: Props) {
  const dayKey = localDayKey(new Date());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [, bumpRead] = useState(0);

  const posters = useMemo(
    () => buildCheckinPosters(detail, messages, dayKey),
    [detail, messages, dayKey],
  );
  const pinnedCount = posters.filter((p) => p.status === 'pinned').length;
  const pendingCount = posters.length - pinnedCount;

  const openPoster = (message?: GroupMessage) => {
    if (!message) return;
    markWallRead(groupId, message.id, dayKey);
    bumpRead((n) => n + 1);
    setExpandedId((cur) => (cur === message.id ? null : message.id));
  };

  return (
    <section className="group-checkin-wall card card-2">
      <div className="group-checkin-wall-head">
        <div>
          <strong>打卡墙</strong>
          <span className="muted group-checkin-wall-sub">
            共 {posters.length} 人
            {groupDetailTodayLine(detail) ? ` · ${groupDetailTodayLine(detail)}` : ''}
            {pendingCount > 0 ? ` · ${pendingCount} 人待钉` : ''}
          </span>
        </div>
        {onOpenMembers && (
          <button type="button" className="text-link" onClick={onOpenMembers}>
            全部成员 ›
          </button>
        )}
      </div>

      <div className="group-poster-grid">
        {posters.map(({ member, message, status }) => {
          const name = displayMemberName(member);
          const initial = memberAvatarInitial(member);
          const isPending = status === 'pending';
          const unread =
            message &&
            isWallUnread(groupId, message.id, Boolean(message.mine), dayKey);
          const expanded = message && expandedId === message.id;
          const refLabel = message?.ref ? formatGroupRefLabel(message.ref) : '';

          return (
            <article
              key={member.user_id || name}
              className={`group-poster-card${isPending ? ' pending' : ' pinned'}${unread ? ' unread' : ''}${member.is_me ? ' me' : ''}${expanded ? ' expanded' : ''}`}
            >
              {isPending ? (
                <div className="group-poster-inner pending-inner">
                  <div className="group-poster-avatar muted-avatar">{initial}</div>
                  <div className="group-poster-meta">
                    <strong>{name}</strong>
                    <span className="group-poster-tag">待打卡</span>
                  </div>
                  <p className="muted group-poster-placeholder">等你钉上今日读经</p>
                </div>
              ) : (
                <button
                  type="button"
                  className="group-poster-inner pinned-inner"
                  onClick={() => openPoster(message)}
                >
                  {unread && <span className="group-poster-new">新</span>}
                  <div className="group-poster-avatar">{initial}</div>
                  <div className="group-poster-meta">
                    <strong>{name}</strong>
                    {message && (
                      <span className="muted group-poster-time">
                        {posterTimeLabel(message.created_at)}
                      </span>
                    )}
                  </div>
                  {refLabel && (
                    <div className="group-poster-ref">{refLabel}</div>
                  )}
                  <p className="group-poster-body">
                    {posterBodyPreview(message?.body, expanded ? 200 : 56)}
                  </p>
                  {expanded && message?.ref && readerHrefFromRef(message.ref) && (
                    <span
                      className="group-poster-link"
                      onClick={(e) => {
                        e.stopPropagation();
                        const href = readerHrefFromRef(message.ref!);
                        if (href) window.location.href = href;
                      }}
                    >
                      读这节经文 ›
                    </span>
                  )}
                </button>
              )}
              {isOwner && isPending && member.role !== 'owner' && (
                <span className="group-poster-pulse" aria-hidden />
              )}
            </article>
          );
        })}
      </div>

      {pinnedCount === 0 && (
        <p className="muted group-poster-empty">今天还没有人钉打卡，来做第一个吧</p>
      )}
    </section>
  );
}
