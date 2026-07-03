'use client';

import { useMemo, useState } from 'react';
import type { GroupDetail, GroupMessage } from '@/lib/api';
import { buildCheckinPosters, posterBodyPreview, posterTimeLabel } from '@/lib/group_checkin_wall';
import { groupDetailTodayLine } from '@/lib/group_status';
import { displayMemberName, localDayKey } from '@/lib/group_ui';
import { isWallUnread, markWallRead } from '@/lib/group_wall_read';
import { formatGroupRefLabel } from '@/lib/ref_label';
import { readerHrefFromRef } from '@/lib/group_footprint';
import { GROUP_CANNED_PHRASES, GROUP_EMOJIS, cannedPhraseLabel } from '@/lib/group_reactions';
import { BASE_PATH } from '@/lib/basePath';
import { MemberAvatar } from './MemberAvatar';

type Props = {
  groupId: string;
  detail: GroupDetail;
  messages: GroupMessage[];
  isOwner?: boolean;
  onReact?: (mid: string, emoji: string) => void;
};

function reactionCount(reactions: Record<string, string[]> | null | undefined): number {
  if (!reactions) return 0;
  return Object.values(reactions).reduce((n, users) => n + users.length, 0);
}

export function GroupCheckinWall({
  groupId,
  detail,
  messages,
  isOwner,
  onReact,
}: Props) {
  const dayKey = localDayKey(new Date());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [respondId, setRespondId] = useState<string | null>(null);
  const [, bumpRead] = useState(0);

  const posters = useMemo(
    () => buildCheckinPosters(detail, messages, dayKey),
    [detail, messages, dayKey],
  );
  const pinnedCount = posters.filter((p) => p.status === 'pinned').length;
  const pendingCount = posters.length - pinnedCount;
  const allPinned = pinnedCount > 0 && pinnedCount === posters.length;
  const pinnedTotal = pinnedCount;

  const openPoster = (message?: GroupMessage) => {
    if (!message) return;
    markWallRead(groupId, message.id, dayKey);
    bumpRead((n) => n + 1);
    setExpandedId((cur) => (cur === message.id ? null : message.id));
    setRespondId(null);
  };

  let pinnedRank = 0;

  return (
    <section
      className={`group-checkin-wall card card-2${allPinned ? ' is-complete' : ''}`}
    >
      {allPinned && (
        <div className="group-checkin-wall-celebrate" aria-live="polite">
          <span className="group-checkin-wall-celebrate-spark" aria-hidden>✨</span>
          全员已钉 · 彼此相爱同行
          <span className="group-checkin-wall-celebrate-spark" aria-hidden>✨</span>
        </div>
      )}

      <div className="group-checkin-wall-head">
        <div>
          <strong>打卡墙</strong>
          <span className="muted group-checkin-wall-sub">
            {groupDetailTodayLine(detail) || `共 ${posters.length} 人`}
            {pendingCount > 0 ? ` · ${pendingCount} 人待钉` : ''}
          </span>
        </div>
        <span className="group-checkin-wall-badge">{pinnedCount}/{posters.length}</span>
      </div>

      {pinnedCount === 0 ? (
        <div className="group-poster-empty-state">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${BASE_PATH || ''}/icon.svg`}
            alt=""
            width={52}
            height={52}
            className="group-poster-empty-icon"
          />
          <strong>今天还没有人钉打卡</strong>
          <p className="muted">窄门先行的那一位，可以是你</p>
        </div>
      ) : (
        <div className="group-poster-scroll">
          <div className="group-poster-grid">
            {posters.map(({ member, message, status }) => {
              const name = displayMemberName(member);
              const isPending = status === 'pending';
              const unread =
                message &&
                isWallUnread(groupId, message.id, Boolean(message.mine), dayKey);
              const expanded = message && expandedId === message.id;
              const refLabel = message?.ref ? formatGroupRefLabel(message.ref) : '';
              const reactions = message?.reactions;
              const totalReactions = reactionCount(reactions);
              const showRespond = message && respondId === message.id;
              const rank = !isPending ? pinnedRank++ : 0;
              const pinIntensity =
                !isPending && pinnedTotal > 1
                  ? 0.72 + (rank / Math.max(pinnedTotal - 1, 1)) * 0.28
                  : 1;

              return (
                <article
                  key={member.user_id || name}
                  className={`group-poster-card${isPending ? ' pending' : ' pinned'}${unread ? ' unread' : ''}${member.is_me ? ' me' : ''}${expanded ? ' expanded' : ''}`}
                  style={
                    !isPending
                      ? ({ '--pin-intensity': pinIntensity } as React.CSSProperties)
                      : undefined
                  }
                >
                  {isPending ? (
                    <div className="group-poster-inner pending-inner">
                      <div className="group-poster-top">
                        <MemberAvatar member={member} size={32} dimmed className="group-poster-avatar-slot" />
                        <div className="group-poster-head-text">
                          <strong className="group-poster-name">{name}</strong>
                          <span className="group-poster-pin-tag pending-tag">待钉</span>
                        </div>
                      </div>
                      <p className="muted group-poster-placeholder">等你钉上今日读经</p>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="group-poster-inner pinned-inner"
                        onClick={() => openPoster(message)}
                      >
                        {unread && <span className="group-poster-new">新</span>}
                        <div className="group-poster-top">
                          <MemberAvatar member={member} size={32} className="group-poster-avatar-slot" />
                          <div className="group-poster-head-text">
                            <strong className="group-poster-name">{name}</strong>
                            <div className="group-poster-meta-line">
                              <span className="group-poster-pin-tag pinned-tag">📌 已钉</span>
                              {message && (
                                <span className="muted group-poster-time">
                                  {posterTimeLabel(message.created_at)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        {refLabel && <div className="group-poster-ref">{refLabel}</div>}
                        <p className="group-poster-body">
                          {posterBodyPreview(message?.body, expanded ? 200 : 48)}
                        </p>
                        {totalReactions > 0 && (
                          <div className="group-poster-reactions-preview">
                            {GROUP_EMOJIS.filter((e) => (reactions?.[e]?.length ?? 0) > 0).map((e) => (
                              <span key={e} className="group-poster-reaction-chip">
                                {e} {reactions![e].length}
                              </span>
                            ))}
                          </div>
                        )}
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
                      {onReact && message && (
                        <div className="group-poster-foot">
                          <button
                            type="button"
                            className="text-link group-poster-respond-btn"
                            onClick={() => setRespondId((id) => (id === message.id ? null : message.id))}
                          >
                            回应{totalReactions > 0 ? ` (${totalReactions})` : ''}
                          </button>
                        </div>
                      )}
                      {showRespond && onReact && message && (
                        <div className="group-poster-respond">
                          <div className="group-emoji-bar">
                            {GROUP_EMOJIS.map((e) => {
                              const count = reactions?.[e]?.length || 0;
                              return (
                                <button
                                  key={e}
                                  type="button"
                                  className={`group-emoji-btn${count > 0 ? ' active' : ''}`}
                                  onClick={() => onReact(message.id, e)}
                                >
                                  {e}{count > 0 ? ` ${count}` : ''}
                                </button>
                              );
                            })}
                          </div>
                          <div className="group-canned-row">
                            {GROUP_CANNED_PHRASES.map((p) => {
                              const count = reactions?.[p.key]?.length || 0;
                              return (
                                <button
                                  key={p.key}
                                  type="button"
                                  className={`group-canned-btn${count > 0 ? ' active' : ''}`}
                                  onClick={() => onReact(message.id, p.key)}
                                >
                                  {cannedPhraseLabel(p.key)}{count > 0 ? ` ${count}` : ''}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                  {isOwner && isPending && member.role !== 'owner' && (
                    <span className="group-poster-pulse" aria-hidden />
                  )}
                </article>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
