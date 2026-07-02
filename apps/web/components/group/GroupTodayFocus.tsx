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
import { formatDueCountdown, groupMemberCount } from '@/lib/group_ui';
import { readerHrefFromRef } from '@/lib/group_footprint';

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

  const myDay = detail.my_plan_day ?? 0;
  const readDay = myDay > 0 ? myDay : 1;
  const joined = detail.plan_id ? isOnGroupPlan(detail.plan_id) : false;
  const myStatus = myTodayGroupStatus(detail);
  const openTasks = tasks.filter((t) => !t.completed);
  const extraTasks = openTasks.filter((t) => t.id !== pinnedTask?.id);

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
        members: groupMemberCount(detail),
      })
    : '';

  const pct = groupMemberCount(detail) > 0
    ? Math.round(((detail.checked_in_today ?? 0) / groupMemberCount(detail)) * 100)
    : 0;

  return (
    <section className="group-today-focus card card-2">
      <div className="group-today-focus-head">
        <span className="group-today-focus-label">今日焦点</span>
        <span className="muted group-today-focus-meta">{groupDetailTodayLine(detail)}</span>
      </div>

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
            <p className="muted" style={{ fontSize: 13, margin: '6px 0 0', lineHeight: 1.5 }}>
              {planInfo.title}
              {planInfo.detail ? ` · ${planInfo.detail}` : ''}
            </p>
          )}
          {progressText && (
            <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
              {progressText}
            </p>
          )}
        </div>
      )}

      <div className="progress-bar" style={{ marginTop: 10 }}>
        <div
          className={`progress-fill${detail.plan_id ? ' plan-fill' : ''}`}
          style={{ width: `${detail.plan_id ? (detail.plan_progress_pct ?? pct) : pct}%` }}
        />
      </div>

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
    </section>
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
