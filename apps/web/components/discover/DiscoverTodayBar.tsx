'use client';

import Link from 'next/link';
import type { DiscoverSummary, Group } from '@/lib/api';

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

type Props = {
  summary: DiscoverSummary | null;
  groups: Group[];
  pendingOnlyIds: Set<string>;
  coldStart: boolean;
};

export function DiscoverTodayBar({ summary, groups, pendingOnlyIds, coldStart }: Props) {
  if (coldStart) return null;

  const realGroups = groups.filter((g) => !pendingOnlyIds.has(g.id));

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
      <article className="card card-2 discover-today discover-today--action">
        <div className="discover-today-row">
          <div
            className="discover-today-ring"
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
            {friendsChecked > 0 && (
              <p className="discover-today-secondary muted">
                今天 {friendsChecked} 位好友已打卡
              </p>
            )}
          </div>
          <Link href={actionHref} className="font-pill accent discover-today-cta">
            {needsCheckin ? '去打卡' : '去完成'}
          </Link>
        </div>
      </article>
    );
  }

  if (realGroups.length > 0) {
    const doneLine = friendsChecked > 0
      ? `今日功课已完成 ✓ · ${friendsChecked} 位好友已打卡`
      : '今日功课已完成 ✓';
    return (
      <Link href="#discover-feed" className="discover-today discover-today--done">
        <span className="discover-today-done-icon" aria-hidden>✓</span>
        <span>{doneLine}</span>
        <span className="discover-today-done-chevron muted">›</span>
      </Link>
    );
  }

  if (friendsChecked > 0) {
    return (
      <Link href="#discover-feed" className="discover-today discover-today--done">
        <span>今天 {friendsChecked} 位好友已打卡</span>
        <span className="discover-today-done-chevron muted">›</span>
      </Link>
    );
  }

  return null;
}
