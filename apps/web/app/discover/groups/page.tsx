'use client';

import Link from 'next/link';
import PageBackBar from '@/components/PageBackBar';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';
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
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { sortGroupsByActionPriority } from '@/lib/group_sort';

function groupStatusBadge(g: Group) {
  return groupListStatusBadge(g);
}

export default function DiscoverGroupsPage() {
  useEdgeSwipeBack({ href: '/discover' });
  const confirm = useConfirm();

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
      const pending = new Set(getPendingOnlyIds(serverGroups.map((item) => item.id)));
      setPendingOnlyIds(pending);
      setGroups(sortGroupsByActionPriority(mergePendingGroups(serverGroups), pending));
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
    const ok = await confirm({
      title: `${label}共读群`,
      message: `确定${label}「${g.name}」？`,
      confirmLabel: label,
      danger: g.role === 'owner' && !isPendingOnly,
    });
    if (!ok) return;
    if (isPendingOnly) {
      dismissPendingGroup(g.id);
      setGroups((prev) => prev.filter((item) => item.id !== g.id));
      return;
    }
    try {
      if (g.role === 'owner') {
        const okDissolve = await confirm({
          title: '解散共读群',
          message: '解散后所有成员将被移出，且不可恢复。确定解散？',
          confirmLabel: '解散',
          danger: true,
        });
        if (!okDissolve) return;
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
          <p>正在准备本机账号，稍候即可查看共读群。</p>
          <Link className="btn" href="/profile">
            前往我的
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="container discover-page">
      <header className="page-head">
        <PageBackBar href="/discover" label="发现" />
        <h2 className="page-head-title">我的共读群</h2>
        <div className="page-head-actions">
          <Link className="btn" style={{ marginTop: 0, padding: '6px 12px', fontSize: 13 }} href="/discover/join">
            加入
          </Link>
          <Link className="text-link" style={{ fontSize: 13 }} href="/group/create">
            创建
          </Link>
        </div>
      </header>

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
                  {!isPendingOnly && badge.tone === 'pending' ? (
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
                  ) : !isPendingOnly ? (
                    <span className={`group-badge group-badge-${badge.tone}`}>
                      {badge.label}
                    </span>
                  ) : null}
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
