'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  api,
  effectiveId,
  ensureAccountReady,
  type Group,
} from '@/lib/api';
import { groupListStatusBadge, groupListSubline } from '@/lib/group_status';
import { clearGroupsListDirty, dismissPendingGroup, hideGroupFromList, getPendingOnlyIds, mergePendingGroups, markGroupsListDirty, useGroupsListRefresh } from '@/lib/groups_refresh';
import { DiscoverGroupActions } from '@/components/discover/DiscoverGroupActions';
import { SwipeRevealRow } from '@/components/SwipeRevealRow';

function groupStatusBadge(g: Group) {
  return groupListStatusBadge(g);
}

export default function DiscoverGroupsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [uid, setUid] = useState<string | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [pendingOnlyIds, setPendingOnlyIds] = useState<Set<string>>(() => new Set());
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const g = await api.myGroups();
      const serverGroups = Array.isArray(g.groups) ? g.groups : [];
      setPendingOnlyIds(new Set(getPendingOnlyIds(serverGroups.map((item) => item.id))));
      setGroups(mergePendingGroups(serverGroups));
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

  const removeGroupFromList = async (g: Group, isPendingOnly: boolean) => {
    const label = g.role === 'owner' && !isPendingOnly ? '解散' : '移除';
    if (!window.confirm(`确定${label}「${g.name}」？`)) return;
    if (isPendingOnly) {
      dismissPendingGroup(g.id);
      setGroups((prev) => prev.filter((item) => item.id !== g.id));
      return;
    }
    try {
      if (g.role === 'owner') {
        if (!window.confirm('解散后所有成员将被移出，且不可恢复。确定解散？')) return;
        await api.dissolveGroup(g.id);
      } else {
        await api.leaveGroup(g.id);
      }
      hideGroupFromList(g.id);
      dismissPendingGroup(g.id);
      markGroupsListDirty();
      setGroups((prev) => prev.filter((item) => item.id !== g.id));
    } catch (e) {
      setErr(String(e));
    }
  };

  if (!uid) {
    return (
      <main className="container">
        <div className="card card-2">
          <p>登录后即可查看共读群。</p>
          <Link className="btn" href="/profile">
            去登录
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="container discover-page">
      <div className="section-row" style={{ marginTop: 0 }}>
        <Link href="/discover" className="muted">
          ‹ 发现
        </Link>
        <span>我的共读群</span>
        <Link className="btn" style={{ marginTop: 0, padding: '6px 12px', fontSize: 13 }} href="/group/create">
          新建
        </Link>
      </div>

      {err && <p className="muted" style={{ marginTop: 8 }}>{err}</p>}

      {groups.length === 0 ? (
        <div className="card card-tint card-2 card-accent" style={{ marginTop: 12 }}>
          <strong>还没有共读群</strong>
          <p className="muted" style={{ marginTop: 6, lineHeight: 1.5 }}>
            创建群或凭邀请码加入，和大家一起读经打卡。
          </p>
          <DiscoverGroupActions />
        </div>
      ) : (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
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
              <SwipeRevealRow
                key={g.id}
                disabled={false}
                deleteLabel={g.role === 'owner' && !isPendingOnly ? '解散' : '移除'}
                onDelete={() => void removeGroupFromList(g, isPendingOnly)}
                onContentClick={() => router.push(`/discover/group/${g.id}`)}
              >
              <div
                className={cardClass}
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
              </SwipeRevealRow>
            );
          })}
        </div>
      )}
    </main>
  );
}
