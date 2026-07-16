'use client';

import { useEffect, useState } from 'react';
import type { GroupDetail, GroupTask } from '@/lib/api';
import { groupMemberCount, localDayKey } from '@/lib/group_ui';

type Props = {
  detail: GroupDetail;
  tasks: GroupTask[];
  onCheckin: () => void;
  onOpenWall?: () => void;
  onOpenCard?: () => void;
  onGoTask?: () => void;
};

/** 今日共读条：仅有任务时显示；可折叠 / 关闭（关闭仅当天生效）。 */
export function GroupCoreadStickyBar({
  detail,
  tasks,
  onCheckin,
  onOpenWall,
  onOpenCard,
  onGoTask,
}: Props) {
  const hasTasks = tasks.length > 0;
  const memberTotal = groupMemberCount(detail);
  const checkedIn = detail.checked_in_today ?? 0;
  const openTasks = tasks.filter((t) => !t.completed);
  const pendingMine = openTasks.length;
  const planLabel = detail.plan_title?.trim() || '今日共读';
  const needCheckin = !detail.my_checked_in_today;
  const allDone = !needCheckin && pendingMine === 0;
  const dayKey = localDayKey(new Date());
  const collapseKey = `group-sticky-collapsed:${detail.id || ''}`;
  const closeKey = `group-sticky-closed:${detail.id || ''}:${dayKey}`;
  const [collapsed, setCollapsed] = useState(false);
  const [closed, setClosed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!detail.id) {
      setReady(true);
      return;
    }
    try {
      setCollapsed(sessionStorage.getItem(collapseKey) === '1');
      setClosed(localStorage.getItem(closeKey) === '1');
    } catch {
      setCollapsed(false);
      setClosed(false);
    }
    setReady(true);
  }, [detail.id, collapseKey, closeKey]);

  if (!hasTasks || !ready || closed) return null;

  const setCollapsedPersist = (next: boolean) => {
    setCollapsed(next);
    try {
      sessionStorage.setItem(collapseKey, next ? '1' : '0');
    } catch {
      /* ignore */
    }
  };

  const closeBar = () => {
    setClosed(true);
    try {
      localStorage.setItem(closeKey, '1');
    } catch {
      /* ignore */
    }
  };

  const meta = (() => {
    if (allDone) return `今日已完成 ✓ · ${checkedIn}/${memberTotal} 已打卡`;
    const parts = [`${checkedIn}/${memberTotal} 已打卡`];
    if (pendingMine > 0) parts.push(`任务 ${pendingMine}`);
    if (needCheckin) parts.unshift('待打卡');
    return parts.join(' · ');
  })();

  if (collapsed) {
    return (
      <div className="group-coread-sticky group-coread-sticky-collapsed group-sticky-zone">
        <button
          type="button"
          className="group-coread-sticky-main"
          onClick={() => setCollapsedPersist(false)}
          aria-expanded={false}
        >
          <span className="group-coread-sticky-meta">
            {planLabel} · {checkedIn}/{memberTotal}
            {pendingMine > 0 ? ` · 任务 ${pendingMine}` : ''}
            {' · 展开'}
          </span>
        </button>
        <button
          type="button"
          className="group-coread-sticky-close"
          onClick={closeBar}
          aria-label="关闭今日共读条"
        >
          ×
        </button>
      </div>
    );
  }

  const cta = (() => {
    if (allDone) {
      return (
        <button type="button" className="group-coread-sticky-cta is-soft" onClick={onOpenWall}>
          打卡墙
        </button>
      );
    }
    if (pendingMine > 0 && onGoTask) {
      return (
        <button type="button" className="group-coread-sticky-cta" onClick={onGoTask}>
          去完成
        </button>
      );
    }
    if (needCheckin) {
      return (
        <button type="button" className="group-coread-sticky-cta" onClick={onCheckin}>
          打卡
        </button>
      );
    }
    return (
      <button type="button" className="group-coread-sticky-cta is-soft" onClick={onOpenWall}>
        打卡墙
      </button>
    );
  })();

  return (
    <div className={`group-coread-sticky group-sticky-zone${allDone ? ' is-done' : ''}`} role="status">
      <button
        type="button"
        className="group-coread-sticky-main"
        onClick={onOpenCard}
        aria-expanded
        aria-label="今日共读"
      >
        <strong className="group-coread-sticky-plan">{planLabel}</strong>
        <span className="muted group-coread-sticky-meta">{meta}</span>
      </button>
      <button
        type="button"
        className="group-coread-sticky-fold"
        onClick={() => setCollapsedPersist(true)}
        aria-label="收起"
      >
        收起
      </button>
      <button
        type="button"
        className="group-coread-sticky-close"
        onClick={closeBar}
        aria-label="关闭今日共读条"
      >
        ×
      </button>
      {cta}
    </div>
  );
}
