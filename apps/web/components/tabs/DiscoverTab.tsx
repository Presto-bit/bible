'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useOnline } from '@/lib/use_online';
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
import { clearGroupsListDirty, dismissPendingGroup, getPendingOnlyIds, mergePendingGroups, useGroupsListRefresh } from '@/lib/groups_refresh';
import ErrorBanner, { errorMessage } from '@/components/ErrorBanner';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { DiscoverGroupActions } from '@/components/discover/DiscoverGroupActions';
import { DiscoverTodayBar } from '@/components/discover/DiscoverTodayBar';
import { FriendActivityCard } from '@/components/discover/FriendActivityCard';
import { GroupInviteInbox } from '@/components/group/GroupInviteInbox';
import { sortGroupsByActionPriority } from '@/lib/group_sort';
import { FEED_LIKE_EMOJI, FEED_READING_EMOJI } from '@/lib/feed_activity';
import { markRouteNavigation } from '@/lib/pwa_tab_nav';

function groupStatusBadge(g: Group) {
  return groupListStatusBadge(g);
}

export default function DiscoverTab() {
  const confirm = useConfirm();
  const router = useRouter();
  const pathname = usePathname();
  const online = useOnline();
  const [uid, setUid] = useState<string | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [pendingOnlyIds, setPendingOnlyIds] = useState<Set<string>>(() => new Set());
  const [friends, setFriends] = useState<Friend[]>([]);
  const [summary, setSummary] = useState<DiscoverSummary | null>(null);
  const [shares, setShares] = useState<FriendActivity[]>([]);
  const [reacted, setReacted] = useState<Record<string, Record<string, boolean>>>({});
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
      const pending = new Set(getPendingOnlyIds(serverGroups.map((item) => item.id)));
      setPendingOnlyIds(pending);
      setGroups(sortGroupsByActionPriority(mergePendingGroups(serverGroups), pending));
      setFriends(Array.isArray(f.friends) ? f.friends : []);
      setSummary(s);
      setShares(Array.isArray(activity.items) ? activity.items : []);
      clearGroupsListDirty();
      setErr(null);
    } catch (e) {
      if (online) setErr(errorMessage(e, '加载失败，请检查网络'));
      else setErr(null);
    }
  }, [online]);

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

  const toggleReact = async (item: FriendActivity, emoji: string) => {
    const prev = reacted[item.id]?.[emoji];
    setReacted((r) => ({
      ...r,
      [item.id]: { ...r[item.id], [emoji]: !prev },
    }));
    try {
      await api.react(item.id, emoji);
      reload();
    } catch {
      setReacted((r) => ({
        ...r,
        [item.id]: { ...r[item.id], [emoji]: prev },
      }));
    }
  };

  const goDiscover = (href: string) => {
    markRouteNavigation();
    router.push(href);
  };

  const isReacted = (item: FriendActivity, emoji: string) => {
    const optimistic = reacted[item.id]?.[emoji];
    if (optimistic !== undefined) return optimistic;
    return uid ? Boolean(item.reactions[emoji]?.includes(uid)) : false;
  };

  if (!uid) {
    return (
      <main className="container">
        <div className="card card-2">
          <p>正在准备本机账号，稍候即可加入共读群、添加好友。</p>
          <Link className="btn" href="/profile">
            前往我的
          </Link>
        </div>
      </main>
    );
  }

  const coldStart = groups.length === 0 && friends.length === 0;

  return (
    <main className="container discover-page">
      {!online ? (
        <p className="muted offline-page-hint">当前离线，共读群与好友动态需联网后刷新。</p>
      ) : null}
      {err ? <ErrorBanner message={err} onRetry={() => void reload()} /> : null}

      <DiscoverTodayBar
        summary={summary}
        groups={groups}
        pendingOnlyIds={pendingOnlyIds}
        coldStart={coldStart}
        shares={shares}
      />

      <GroupInviteInbox onChanged={() => void reload()} />

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
          <div className="tab-section-head">
            <p className="section-label tab-section-label">我的共读</p>
            <Link href="/discover/groups" className="tab-section-link muted">
              查看全部 ›
            </Link>
          </div>
          <div className="rail discover-group-rail">
            {groups.map((g) => {
              const badge = groupStatusBadge(g);
              const isPendingOnly = pendingOnlyIds.has(g.id);
              const members = g.members || 1;
              const checked = g.checked_in_today ?? 0;
              const barPct = members > 0 ? Math.round((checked / members) * 100) : 0;
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
                  onClick={() => goDiscover(`/discover/group/${g.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      goDiscover(`/discover/group/${g.id}`);
                    }
                  }}
                >
                  {openTasks > 0 && !g.my_checked_in_today && (
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
                        onClick={async (e) => {
                          e.stopPropagation();
                          const ok = await confirm({
                            title: '移除群',
                            message: `从列表移除「${g.name}」？`,
                            confirmLabel: '移除',
                          });
                          if (!ok) return;
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
                          goDiscover(`/discover/group/${g.id}?focus=checkin`);
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
            <Link href="/discover/join" className="rail-card card card-2 group-card group-card-add">
              <span className="group-add-plus">+</span>
              <span>加入群</span>
            </Link>
            <Link href="/group/create" className="rail-card card card-2 group-card group-card-add">
              <span className="group-add-plus">👥</span>
              <span>创建群</span>
            </Link>
          </div>
        </>
      )}

      <div id="discover-feed" className="tab-section-head">
        <p className="section-label tab-section-label">好友动态</p>
        <Link href="/discover/friends" className="tab-section-link muted">
          我的好友 ›
        </Link>
      </div>

      {friends.length === 0 ? (
        <div className="card discover-empty-card">
          <strong>添加好友后可见动态</strong>
          <p className="muted" style={{ marginTop: 6, lineHeight: 1.5 }}>
            好友的群内打卡与主动分享会出现在下方动态，不会上传默默阅读进度。
          </p>
          <Link className="font-pill" href="/friend/add">
            加好友
          </Link>
        </div>
      ) : shares.length === 0 ? (
        <p className="muted discover-feed-empty">
          暂无好友动态，去群里打卡或等好友分享吧
        </p>
      ) : (
        <div className="discover-feed">
          {shares.map((s) => (
            <FriendActivityCard
              key={`${s.source}-${s.id}`}
              item={s}
              liked={isReacted(s, FEED_LIKE_EMOJI)}
              readingMarked={isReacted(s, FEED_READING_EMOJI)}
              onLike={() => void toggleReact(s, FEED_LIKE_EMOJI)}
              onReading={() => void toggleReact(s, FEED_READING_EMOJI)}
              authorHref={s.author_id ? `/discover/friends/${s.author_id}` : undefined}
            />
          ))}
        </div>
      )}
    </main>
  );
}
