'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  api,
  effectiveId,
  ensureAccountReady,
  type DiscoverSummary,
  type Friend,
  type FriendActivity,
  type Group,
} from '@/lib/api';
import { groupListStatusBadge, groupListSubline } from '@/lib/group_status';
import { readerHrefFromRef } from '@/lib/group_footprint';
import { clearGroupsListDirty, dismissPendingGroup, getPendingOnlyIds, mergePendingGroups, useGroupsListRefresh } from '@/lib/groups_refresh';
import { AssistantLink } from '@/components/AssistantLink';
import { DiscoverGroupActions } from '@/components/discover/DiscoverGroupActions';

function reactionTotal(reactions: Record<string, string[]> | null | undefined): number {
  if (!reactions) return 0;
  return Object.values(reactions).reduce((n, users) => n + users.length, 0);
}

function groupStatusBadge(g: Group) {
  return groupListStatusBadge(g);
}

function summaryLinkTarget(
  summary: DiscoverSummary | null,
  groups: Group[],
): string | null {
  if (!summary) return null;
  if (summary.first_pending_group_id) {
    return `/discover/group/${summary.first_pending_group_id}`;
  }
  if (
    (summary.groups_pending_checkin > 0 || summary.groups_pending_tasks > 0) &&
    groups.length > 0
  ) {
    return '/discover/groups';
  }
  return null;
}

export default function DiscoverPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [uid, setUid] = useState<string | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [pendingOnlyIds, setPendingOnlyIds] = useState<Set<string>>(() => new Set());
  const [friends, setFriends] = useState<Friend[]>([]);
  const [summary, setSummary] = useState<DiscoverSummary | null>(null);
  const [shares, setShares] = useState<FriendActivity[]>([]);
  const [reacted, setReacted] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [g, f, s, activity] = await Promise.all([
        api.myGroups(),
        api.friends(),
        api.discoverSummary(),
        api.friendsActivity(),
      ]);
      const serverGroups = Array.isArray(g.groups) ? g.groups : [];
      setPendingOnlyIds(new Set(getPendingOnlyIds(serverGroups.map((item) => item.id))));
      setGroups(mergePendingGroups(serverGroups));
      setFriends(Array.isArray(f.friends) ? f.friends : []);
      setSummary(s);
      setShares(Array.isArray(activity.items) ? activity.items : []);
      clearGroupsListDirty();
      setErr(null);
    } catch (e) {
      setErr(String(e));
    }
  }, []);

  useEffect(() => {
    void ensureAccountReady().then(() => {
      const id = effectiveId();
      setUid(id || null);
    });
  }, []);

  useEffect(() => {
    if (!uid) return;
    void reload();
  }, [uid, pathname, reload]);

  useGroupsListRefresh(reload, Boolean(uid));

  const toggleReact = async (item: FriendActivity) => {
    const prev = reacted[item.id];
    setReacted((r) => ({ ...r, [item.id]: prev === '❤️' ? '' : '❤️' }));
    try {
      await api.react(item.id, '❤️');
      reload();
    } catch {
      setReacted((r) => ({ ...r, [item.id]: prev || '' }));
    }
  };

  if (!uid) {
    return (
      <main className="container">
        <div className="card card-2">
          <p>登录后即可加入共读群、添加好友、一起打卡。</p>
          <Link className="btn" href="/profile">
            去登录
          </Link>
        </div>
      </main>
    );
  }

  const coldStart = groups.length === 0 && friends.length === 0;

  const summaryText = (() => {
    if (!summary) return '加载中…';
    if (coldStart) return '还没有共读群 · 受邀或创建一个开始';
    const parts: string[] = [];
    if (summary.groups_pending_checkin > 0) {
      parts.push(`${summary.groups_pending_checkin} 个群待打卡`);
    }
    if (summary.groups_pending_tasks > 0) {
      parts.push(`${summary.groups_pending_tasks} 个群任务待完成`);
    }
    if (summary.friends_checked_in_today > 0) {
      parts.push(`今天 ${summary.friends_checked_in_today} 位好友打卡`);
    }
    return parts.length > 0 ? parts.join(' · ') : '今日已全部打卡，继续保持';
  })();

  const todayHref = summaryLinkTarget(summary, groups);

  const todayInner = (
    <>
      <div className="today-title">今日</div>
      <p className="today-sub">{summaryText}</p>
      {todayHref && <span className="today-cta muted">去看看 ›</span>}
    </>
  );

  return (
    <main className="container discover-page">
      {err && <p className="muted" style={{ marginBottom: 8 }}>{err}</p>}

      {todayHref ? (
        <Link
          href={todayHref}
          className="card card-tint card-2 card-accent today-card today-card-link"
        >
          {todayInner}
        </Link>
      ) : (
        <div className="card card-tint card-2 card-accent today-card">
          {todayInner}
        </div>
      )}

      {groups.length === 0 ? (
        <div className="card card-tint card-2 card-accent discover-hero">
          <strong>共读群 · 一起读</strong>
          <p className="muted" style={{ marginTop: 6, lineHeight: 1.5 }}>
            受好友邀请，或自己创建一个群，和大家按计划一起读、彼此打卡。
          </p>
          <DiscoverGroupActions />
        </div>
      ) : (
        <>
          <div className="section-row" style={{ marginTop: 14 }}>
            <span>我的共读</span>
            <Link href="/discover/groups" className="muted">
              查看全部 ›
            </Link>
          </div>
          <div className="rail discover-group-rail" style={{ marginTop: 8 }}>
            {groups.map((g) => {
              const badge = groupStatusBadge(g);
              const isPendingOnly = pendingOnlyIds.has(g.id);
              const members = g.members || 1;
              const checked = g.checked_in_today ?? 0;
              const barPct = g.plan_id
                ? (g.plan_progress_pct ?? 0)
                : Math.round((checked / members) * 100);
              const planSub = groupListSubline(g);
              const openTasks = g.open_tasks ?? 0;
              const cardClass = [
                'rail-card',
                'card',
                'card-2',
                'group-card',
                'group-card-clickable',
                badge.tone === 'pending' ? 'group-card-pending' : '',
                g.my_checked_in_today ? 'group-card-done' : '',
                openTasks > 0 ? 'group-card-has-tasks' : '',
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <div
                  key={g.id}
                  className={cardClass}
                  role="button"
                  tabIndex={0}
                  onClick={() => router.push(`/discover/group/${g.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      router.push(`/discover/group/${g.id}`);
                    }
                  }}
                >
                  {openTasks > 0 && (
                    <span className="group-card-task-badge" aria-label={`${openTasks} 个任务`}>
                      {openTasks}
                    </span>
                  )}
                  <div className="group-card-head">
                    <strong>{g.name}</strong>
                    {g.role === 'owner' && <span className="rail-cta">群主</span>}
                  </div>
                  <p className="muted" style={{ fontSize: 12, margin: '4px 0' }}>
                    {g.plan_title || planSub}
                  </p>
                  <div className="progress-bar">
                    <div
                      className={`progress-fill${g.plan_id ? ' plan-fill' : ''}`}
                      style={{ width: `${barPct}%` }}
                    />
                  </div>
                  <div className="group-card-foot">
                    <span className="muted">
                      {isPendingOnly ? '同步中…' : `今日 ${checked}/${members}`}
                    </span>
                    {isPendingOnly ? (
                      <button
                        type="button"
                        className="text-link group-card-cta"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!window.confirm(`从列表移除「${g.name}」？`)) return;
                          dismissPendingGroup(g.id);
                          setGroups((prev) => prev.filter((item) => item.id !== g.id));
                          setPendingOnlyIds((prev) => {
                            const next = new Set(prev);
                            next.delete(g.id);
                            return next;
                          });
                        }}
                      >
                        移除
                      </button>
                    ) : badge.tone === 'pending' ? (
                      <button
                        type="button"
                        className="font-pill accent group-card-cta"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/discover/group/${g.id}?focus=checkin`);
                        }}
                      >
                        去打卡
                      </button>
                    ) : (
                      <span className={`group-badge group-badge-${badge.tone}`}>
                        {badge.label}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            <Link href="/group/create" className="rail-card card card-2 group-card group-card-add">
              <span className="group-add-plus">+</span>
              <span>新建群</span>
            </Link>
          </div>
        </>
      )}

      <div className="section-row" style={{ marginTop: 18 }}>
        <span>好友动态</span>
        <Link href="/friend/add" className="muted">
          加好友 ›
        </Link>
      </div>

      {friends.length === 0 ? (
        <div className="card" style={{ marginTop: 8 }}>
          <strong>添加好友后可见动态</strong>
          <p className="muted" style={{ marginTop: 6, lineHeight: 1.5 }}>
            好友的经文打卡会出现在这里，可点赞、问小爱或跳转同章阅读。
          </p>
          <Link className="font-pill" href="/friend/add">
            加好友
          </Link>
        </div>
      ) : shares.length === 0 ? (
        <p className="muted" style={{ marginTop: 8 }}>
          暂无好友动态，去群里打卡或等好友分享吧
        </p>
      ) : (
        shares.map((s) => {
          const isShare = s.source === 'share';
          const canReact = true;
          const likes = reactionTotal(s.reactions) + (canReact && reacted[s.id] === '❤️' ? 1 : 0);
          const refHref = s.ref ? readerHrefFromRef(s.ref) : null;
          const sourceLabel = isShare
            ? (s.kind === 'thought' ? '分享了想法' : '分享了笔记')
            : s.group_name;
          return (
            <div key={`${s.source}-${s.id}`} className="card share-card">
              <div className="share-card-head">
                <strong>{s.author}</strong>
                {sourceLabel && (
                  <span className="muted" style={{ fontSize: 12 }}>
                    {sourceLabel}
                  </span>
                )}
              </div>
              <p className="muted">{s.ref || (isShare ? '想法' : '打卡')}</p>
              {s.body && <p style={{ marginTop: 6, lineHeight: 1.5 }}>{s.body}</p>}
              {canReact && (
                <button
                  type="button"
                  className="like-btn"
                  onClick={() => toggleReact(s)}
                >
                  {reacted[s.id] === '❤️' ? '❤️' : '🤍'} {likes}
                </button>
              )}
              <div className="share-actions">
                {s.ref && (
                  <AssistantLink
                    className="font-pill"
                    refParam={s.ref}
                    excerpt={s.body || undefined}
                  >
                    问小爱
                  </AssistantLink>
                )}
                {refHref ? (
                  <Link className="font-pill" href={refHref}>
                    我也在读
                  </Link>
                ) : (
                  <Link className="font-pill" href="/reader">
                    我也在读
                  </Link>
                )}
              </div>
            </div>
          );
        })
      )}
    </main>
  );
}
