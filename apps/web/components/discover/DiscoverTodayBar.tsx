'use client';

import Link from 'next/link';
import type { DiscoverSummary, FriendActivity, Group } from '@/lib/api';
import { friendDisplayName } from '@/lib/friend_label';
import { FriendAvatar } from '@/components/discover/FriendAvatar';

function firstPendingGroup(
  groups: Group[],
  pendingOnlyIds: Set<string>,
  summary: DiscoverSummary,
): Group | null {
  if (summary.first_pending_group_id) {
    const match = groups.find((g) => g.id === summary.first_pending_group_id);
    if (match && !pendingOnlyIds.has(match.id)) return match;
  }
  return (
    groups.find(
      (g) =>
        !pendingOnlyIds.has(g.id)
        && (!g.my_checked_in_today || (g.open_tasks ?? 0) > 0),
    ) ?? null
  );
}

function todayCheckinFriends(shares: FriendActivity[]): FriendActivity[] {
  const seen = new Set<string>();
  const out: FriendActivity[] = [];
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  for (const item of shares) {
    if (item.source === 'share') continue;
    if (new Date(item.created_at) < todayStart) continue;
    const key = item.author_id || item.author;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= 3) break;
  }
  return out;
}

function FriendCheckinStrip({
  count,
  friends,
  compact = false,
  standalone = false,
}: {
  count: number;
  friends: FriendActivity[];
  compact?: boolean;
  standalone?: boolean;
}) {
  if (count <= 0) return null;
  const names = friends
    .map((f) => friendDisplayName({ user_id: f.author_id ?? '', display_name: f.author }))
    .filter(Boolean);
  const nameHint = names.length > 0
    ? names.length >= 2
      ? `${names[0]}、${names[1]}${count > 2 ? ' 等' : ''}`
      : names[0]
    : null;

  const className = [
    'discover-today-friends',
    compact ? 'discover-today-friends--compact' : '',
    standalone ? 'discover-today-friends--standalone' : '',
  ].filter(Boolean).join(' ');

  return (
    <Link href="#discover-feed" className={className}>
      {friends.length > 0 && (
        <span className="discover-today-avatar-stack" aria-hidden>
          {friends.map((f) => (
            <FriendAvatar
              key={f.author_id || f.author}
              friend={{
                user_id: f.author_id ?? '',
                display_name: f.author,
                author_avatar_id: f.author_avatar_id,
              }}
              size={compact ? 24 : 28}
            />
          ))}
        </span>
      )}
      <span className="discover-today-friends-text">
        {nameHint ? (
          <>
            <strong>{nameHint}</strong>
            <span className="muted"> 今日已打卡</span>
          </>
        ) : (
          <span>今天 {count} 位好友已打卡</span>
        )}
      </span>
      <span className="discover-today-friends-chevron muted" aria-hidden>›</span>
    </Link>
  );
}

type Props = {
  summary: DiscoverSummary | null;
  groups: Group[];
  pendingOnlyIds: Set<string>;
  coldStart: boolean;
  shares?: FriendActivity[];
};

export function DiscoverTodayBar({
  summary,
  groups,
  pendingOnlyIds,
  coldStart,
  shares = [],
}: Props) {
  if (coldStart) return null;

  const realGroups = groups.filter((g) => !pendingOnlyIds.has(g.id));
  const checkinFriends = todayCheckinFriends(shares);

  if (!summary) {
    return (
      <div className="discover-today discover-today--loading card card-2" aria-busy="true">
        <span className="discover-today-skeleton" />
      </div>
    );
  }

  const pendingCheckin = summary.groups_pending_checkin;
  const pendingTasks = summary.groups_pending_tasks;
  const friendsChecked = summary.friends_checked_in_today;
  const hasAction = pendingCheckin > 0 || pendingTasks > 0;
  const pendingGroup = hasAction ? firstPendingGroup(groups, pendingOnlyIds, summary) : null;

  if (hasAction && pendingGroup) {
    const needsCheckin = !pendingGroup.my_checked_in_today;
    const groupTasks = pendingGroup.open_tasks ?? 0;
    const groupsDone = realGroups.filter((g) => g.my_checked_in_today).length;
    const groupsTotal = realGroups.length;
    const ringPct = groupsTotal > 0 ? Math.round((groupsDone / groupsTotal) * 100) : 0;
    const actionHref = `/discover/group/${pendingGroup.id}?focus=checkin`;

    return (
      <article className={`card card-2 discover-today discover-today--action${needsCheckin ? ' discover-today--urgent' : ''}`}>
        <div className="discover-today-glow" aria-hidden />
        <div className="discover-today-row">
          <div
            className={`discover-today-ring${needsCheckin ? ' discover-today-ring--pulse' : ''}`}
            style={{
              background: `conic-gradient(var(--accent-deep) ${ringPct * 3.6}deg, var(--line) 0deg)`,
            }}
            aria-hidden
          >
            <span className="discover-today-ring-inner">
              {groupsDone}/{groupsTotal}
            </span>
          </div>
          <div className="discover-today-body">
            <div className="discover-today-label">今日待办</div>
            <p className="discover-today-primary">
              <strong>{pendingGroup.name}</strong>
              {needsCheckin ? ' · 你还未打卡' : ` · ${groupTasks} 个任务待完成`}
            </p>
            {pendingCheckin > 1 && (
              <p className="discover-today-secondary muted">
                另有 {pendingCheckin - 1} 个群待打卡
              </p>
            )}
            {!needsCheckin && pendingTasks > 1 && (
              <p className="discover-today-secondary muted">
                另有 {pendingTasks - 1} 个群有任务
              </p>
            )}
            {needsCheckin && pendingTasks > 0 && (
              <p className="discover-today-secondary muted">
                {pendingTasks} 个群有任务待完成
              </p>
            )}
          </div>
          <Link href={actionHref} className="font-pill accent discover-today-cta">
            {needsCheckin ? '去打卡' : '去完成'}
          </Link>
        </div>
        <FriendCheckinStrip count={friendsChecked} friends={checkinFriends} />
      </article>
    );
  }

  if (realGroups.length > 0) {
    return (
      <Link href="#discover-feed" className="discover-today discover-today--done discover-today--done-gold">
        <span className="discover-today-done-icon" aria-hidden>✓</span>
        <span className="discover-today-done-main">
          <span className="discover-today-done-title">今日功课已完成</span>
          {friendsChecked > 0 && (
            <span className="discover-today-done-sub muted">
              {friendsChecked} 位好友也在打卡
            </span>
          )}
        </span>
        {friendsChecked > 0 && checkinFriends.length > 0 && (
          <span className="discover-today-avatar-stack discover-today-avatar-stack--inline" aria-hidden>
            {checkinFriends.map((f) => (
              <FriendAvatar
                key={f.author_id || f.author}
                friend={{
                  user_id: f.author_id ?? '',
                  display_name: f.author,
                  author_avatar_id: f.author_avatar_id,
                }}
                size={26}
              />
            ))}
          </span>
        )}
        <span className="discover-today-done-chevron muted">›</span>
      </Link>
    );
  }

  if (friendsChecked > 0) {
    return (
      <FriendCheckinStrip
        count={friendsChecked}
        friends={checkinFriends}
        compact
        standalone
      />
    );
  }

  return null;
}
