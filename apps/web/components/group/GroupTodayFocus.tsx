'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { GroupDetail, GroupTask } from '@/lib/api';
import { loadGroupPlanDayInfo, type GroupPlanDayInfo } from '@/lib/group_plan_day';
import {
  adoptGroupPlan,
  groupPlanProgressLabel,
  groupPlanReaderHref,
  isOnGroupPlan,
} from '@/lib/group_plan';
import { groupDetailTodayLine, myTodayGroupStatus, myTodayGroupStatusLabel } from '@/lib/group_status';
import { displayMemberName, formatDueCountdown, groupMemberCount } from '@/lib/group_ui';
import { readerHrefFromRef } from '@/lib/group_footprint';
import { MemberAvatar } from './MemberAvatar';

type Props = {
  gid: string;
  detail: GroupDetail;
  pinnedTask?: GroupTask | null;
  tasks: GroupTask[];
  onCheckin: () => void;
  onCompleteTask?: (taskId: string, title: string, ref?: string | null) => void;
};

export function GroupTodayFocus({
  gid,
  detail,
  pinnedTask,
  tasks,
  onCheckin,
  onCompleteTask,
}: Props) {
  const [planInfo, setPlanInfo] = useState<GroupPlanDayInfo | null>(null);
  const [planBusy, setPlanBusy] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);

  const myDay = detail.my_plan_day ?? 0;
  const readDay = myDay > 0 ? myDay : 1;
  const joined = detail.plan_id ? isOnGroupPlan(detail.plan_id) : false;
  const myStatus = myTodayGroupStatus(detail);
  const openTasks = tasks.filter((t) => !t.completed);
  const extraTasks = openTasks.filter((t) => t.id !== pinnedTask?.id);
  const memberTotal = groupMemberCount(detail);
  const checkedIn = detail.checked_in_today ?? 0;
  const pendingIn = memberTotal - checkedIn;

  useEffect(() => {
    if (!detail.plan_id) {
      setPlanInfo(null);
      return;
    }
    let cancelled = false;
    void loadGroupPlanDayInfo(detail.plan_id, readDay, gid).then((info) => {
      if (!cancelled) setPlanInfo(info);
    });
    return () => {
      cancelled = true;
    };
  }, [detail.plan_id, readDay, gid]);

  const adoptAndRead = async () => {
    if (!detail.plan_id) return;
    setPlanBusy(true);
    try {
      await adoptGroupPlan(detail.plan_id, myDay > 0 ? myDay : undefined);
      window.location.href = groupPlanReaderHref(detail.plan_id, readDay, gid);
    } finally {
      setPlanBusy(false);
    }
  };

  const progressText = detail.plan_id
    ? groupPlanProgressLabel({
        plan_day_avg: detail.plan_day_avg,
        plan_days_total: detail.plan_days_total,
        my_plan_day: detail.my_plan_day,
        members_on_plan: detail.members_on_plan,
        members: memberTotal,
      })
    : '';

  const checkinPct = memberTotal > 0 ? Math.round((checkedIn / memberTotal) * 100) : 0;
  const barPct = detail.plan_id ? (detail.plan_progress_pct ?? checkinPct) : checkinPct;

  const members = detail.members ?? [];

  return (
    <>
      <section className="group-today-focus card card-2">
        <div className="group-today-focus-head">
          <span className="group-today-focus-label">今日焦点</span>
          <span className="muted group-today-focus-meta">{groupDetailTodayLine(detail)}</span>
        </div>

        <div className="group-today-focus-grid">
          <div className="group-today-focus-main">
            <div className="group-today-focus-status">
              <span className={`group-today-pill group-today-pill-${myStatus}`}>
                {myTodayGroupStatusLabel(myStatus)}
              </span>
            </div>

            {detail.announcement && (
              <div className="group-today-announce">
                <span className="group-wechat-announce-tag">公告</span>
                <p>{detail.announcement}</p>
              </div>
            )}

            {detail.plan_id && detail.plan_title && (
              <div className="group-today-plan">
                <strong>{detail.plan_title}</strong>
                {planInfo && (
                  <p className="muted group-today-plan-detail">
                    {planInfo.title}
                    {planInfo.detail ? ` · ${planInfo.detail}` : ''}
                  </p>
                )}
                {progressText && <p className="muted group-today-plan-progress">{progressText}</p>}
              </div>
            )}

            <div className="group-today-actions">
              {detail.plan_id ? (
                joined ? (
                  <Link className="btn group-today-btn-read" href={groupPlanReaderHref(detail.plan_id, readDay, gid)}>
                    开始阅读
                  </Link>
                ) : (
                  <button type="button" className="btn group-today-btn-read" disabled={planBusy} onClick={adoptAndRead}>
                    {planBusy ? '准备中…' : '加入计划并阅读'}
                  </button>
                )
              ) : null}
              {!detail.my_checked_in_today ? (
                <button type="button" className="btn group-today-btn-checkin" onClick={onCheckin}>
                  一键打卡
                </button>
              ) : (
                <span className="group-today-done-note">今日已打卡 ✓</span>
              )}
            </div>

            {(pinnedTask || extraTasks.length > 0) && (
              <div className="group-today-tasks">
                <div className="group-today-tasks-head">
                  <span className="group-wechat-zone-label">本周任务</span>
                  {extraTasks.length > 0 && (
                    <span className="muted" style={{ fontSize: 12 }}>还有 {extraTasks.length} 项</span>
                  )}
                </div>
                {pinnedTask && (
                  <TaskRow gid={gid} task={pinnedTask} pinned onCompleteTask={onCompleteTask} />
                )}
                {extraTasks.slice(0, 2).map((t) => (
                  <TaskRow key={t.id} gid={gid} task={t} onCompleteTask={onCompleteTask} />
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            className="group-today-stats-card"
            onClick={() => setStatsOpen(true)}
            aria-label="查看打卡明细"
          >
            <div className="group-today-stats-ring" style={{ '--pct': barPct } as React.CSSProperties}>
              <span className="group-today-stats-pct">{checkinPct}%</span>
            </div>
            <strong className="group-today-stats-title">今日打卡</strong>
            <p className="muted group-today-stats-sub">
              {checkedIn}/{memberTotal} 人已钉
            </p>
            <div className="progress-bar group-today-stats-bar">
              <div
                className={`progress-fill${detail.plan_id ? ' plan-fill' : ''}`}
                style={{ width: `${barPct}%` }}
              />
            </div>
            {pendingIn > 0 && (
              <span className="group-today-stats-hint">{pendingIn} 人待钉</span>
            )}
            <span className="group-today-stats-link">查看明细 ›</span>
          </button>
        </div>
      </section>

      {statsOpen && (
        <div className="sheet-backdrop" onClick={() => setStatsOpen(false)}>
          <div className="sheet card group-checkin-stats-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="half-sheet-grab" aria-hidden />
            <div className="section-row">
              <strong>今日打卡明细</strong>
              <button type="button" className="text-link" onClick={() => setStatsOpen(false)}>
                关闭
              </button>
            </div>
            <p className="muted" style={{ fontSize: 13, margin: '0 0 12px' }}>
              {groupDetailTodayLine(detail)} · 打卡率 {checkinPct}%
            </p>
            <ul className="group-checkin-stats-list">
              {members.map((m) => (
                <li key={m.user_id || displayMemberName(m)} className="group-checkin-stats-row">
                  <div className={`group-member-avatar-inline sm${m.checked_in_today ? ' checked' : ''}`}>
                    <MemberAvatar member={m} size={32} />
                  </div>
                  <span className="group-checkin-stats-name">{displayMemberName(m)}</span>
                  <span className={`group-checkin-stats-badge${m.checked_in_today ? ' done' : ''}`}>
                    {m.checked_in_today ? '已钉 ✓' : '待钉'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}

function TaskRow({
  gid,
  task,
  pinned,
  onCompleteTask,
}: {
  gid: string;
  task: GroupTask;
  pinned?: boolean;
  onCompleteTask?: (taskId: string, title: string, ref?: string | null) => void;
}) {
  const dueLabel = formatDueCountdown(task.due_at);
  const taskHref = task.ref ? readerHrefFromRef(task.ref, { group: gid, task: task.id }) : null;

  return (
    <div className={`group-today-task-row${pinned ? ' pinned' : ''}`}>
      <div className="group-today-task-main">
        {pinned && <span aria-hidden>📌 </span>}
        <strong>{task.title}</strong>
        {dueLabel && <span className="group-task-due-badge">{dueLabel}</span>}
      </div>
      <div className="group-today-task-actions">
        {taskHref && !task.completed && (
          <Link
            href={`${taskHref}&taskTitle=${encodeURIComponent(task.title)}`}
            className="font-pill"
          >
            去读
          </Link>
        )}
        {!task.completed && onCompleteTask && (
          <button
            type="button"
            className="font-pill accent"
            onClick={() => onCompleteTask(task.id, task.title, task.ref)}
          >
            完成
          </button>
        )}
      </div>
    </div>
  );
}
