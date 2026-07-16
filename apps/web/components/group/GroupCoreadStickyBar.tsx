'use client';

import { useEffect, useState } from 'react';
import type { GroupDetail, GroupTask } from '@/lib/api';
import { groupMemberCount } from '@/lib/group_ui';

type Props = {
  detail: GroupDetail;
  tasks: GroupTask[];
  onCheckin: () => void;
  onOpenWall?: () => void;
  onOpenCard?: () => void;
  onGoTask?: () => void;
};

/** 今日共读条：常态展示；可折叠；完成后仍可见。 */
export function GroupCoreadStickyBar({
  detail,
  tasks,
  onCheckin,
  onOpenWall,
  onOpenCard,
  onGoTask,
}: Props) {
  const memberTotal = groupMemberCount(detail);
  const checkedIn = detail.checked_in_today ?? 0;
  const openTasks = tasks.filter((t) => !t.completed);
  const pendingMine = openTasks.length;
  const planLabel = detail.plan_title?.trim() || '今日共读';
  const needCheckin = !detail.my_checked_in_today;
  const allDone = !needCheckin && pendingMine === 0;
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
        <button type="button" className="group-coread-sticky-main" onClick={toggle} aria-expanded={false}>
          <span className="group-coread-sticky-meta">
            {planLabel} · {checkedIn}/{memberTotal}
            {pendingMine > 0 ? ` · 任务 ${pendingMine}` : ''}
            {' · 展开'}
          </span>
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
    if (needCheckin) {
      return (
        <button type="button" className="group-coread-sticky-cta" onClick={onCheckin}>
          打卡
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
        onClick={onOpenCard || toggle}
        aria-expanded
        aria-label="今日共读"
      >
        <strong className="group-coread-sticky-plan">{planLabel}</strong>
        <span className="muted group-coread-sticky-meta">{meta}</span>
      </button>
      <button type="button" className="group-coread-sticky-fold" onClick={toggle} aria-label="收起">
        收起
      </button>
      {cta}
    </div>
  );
}
