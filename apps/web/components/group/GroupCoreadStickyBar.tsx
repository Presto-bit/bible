'use client';

import { useEffect, useState } from 'react';
import type { GroupDetail, GroupTask } from '@/lib/api';
import { groupMemberCount } from '@/lib/group_ui';

type Props = {
  detail: GroupDetail;
  tasks: GroupTask[];
  onCheckin: () => void;
};

/** 群会话内细状态条：仅有待打卡/未完成任务时显示；可折叠；完成后自动消失。 */
export function GroupCoreadStickyBar({ detail, tasks, onCheckin }: Props) {
  const memberTotal = groupMemberCount(detail);
  const checkedIn = detail.checked_in_today ?? 0;
  const openTasks = tasks.filter((t) => !t.completed);
  const planLabel = detail.plan_title?.trim() || '共读群';
  const needCheckin = !detail.my_checked_in_today;
  const hasTodo = needCheckin || openTasks.length > 0;
  const storageKey = `group-sticky-collapsed:${detail.id || ''}`;
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!detail.id) return;
    try {
      setCollapsed(sessionStorage.getItem(storageKey) === '1');
    } catch {
      setCollapsed(false);
    }
  }, [detail.id, storageKey]);

  // 有新待办时展开一次
  useEffect(() => {
    if (!hasTodo) return;
    if (needCheckin || openTasks.length > 0) {
      // keep user collapse preference
    }
  }, [hasTodo, needCheckin, openTasks.length]);

  if (!hasTodo) return null;

  const toggle = () => {
    setCollapsed((v) => {
      const next = !v;
      try {
        sessionStorage.setItem(storageKey, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  if (collapsed) {
    return (
      <button
        type="button"
        className="group-coread-sticky group-coread-sticky-collapsed group-sticky-zone"
        onClick={toggle}
        aria-expanded={false}
      >
        <span className="group-coread-sticky-meta">
          {needCheckin ? '待打卡' : ''}
          {needCheckin && openTasks.length ? ' · ' : ''}
          {openTasks.length > 0 ? `任务 ${openTasks.length}` : ''}
          {' · 展开'}
        </span>
      </button>
    );
  }

  return (
    <div className="group-coread-sticky group-sticky-zone" role="status">
      <button
        type="button"
        className="group-coread-sticky-main"
        onClick={toggle}
        aria-expanded
        aria-label="折叠共读状态"
      >
        <strong className="group-coread-sticky-plan">{planLabel}</strong>
        <span className="muted group-coread-sticky-meta">
          今日 {checkedIn}/{memberTotal}
          {openTasks.length > 0 ? ` · 任务 ${openTasks.length}` : ''}
          {' · 收起'}
        </span>
      </button>
      {needCheckin ? (
        <button type="button" className="group-coread-sticky-cta" onClick={onCheckin}>
          打卡
        </button>
      ) : (
        <span className="group-coread-sticky-done" aria-hidden>
          ✓
        </span>
      )}
    </div>
  );
}
