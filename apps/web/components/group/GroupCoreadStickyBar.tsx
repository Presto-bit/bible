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
  announcement?: string | null;
  onOpenAnnounce?: () => void;
  prayerCount?: number;
  onOpenPrayer?: () => void;
  pinnedTitle?: string | null;
  onOpenPinned?: () => void;
};

/** 今日共读条：有计划、未完成任务或今日打卡进度才出现；可当天关闭。 */
export function GroupCoreadStickyBar({
  detail,
  tasks,
  onCheckin,
  onOpenWall,
  onOpenCard,
  onGoTask,
  announcement,
  onOpenAnnounce,
  prayerCount = 0,
  onOpenPrayer,
  pinnedTitle,
  onOpenPinned,
}: Props) {
  const openTasks = tasks.filter((t) => !t.completed);
  const hasPlan = Boolean(detail.plan_title?.trim() || detail.plan_id);
  const checkedIn = detail.checked_in_today ?? 0;
  const hasProgress = checkedIn > 0;
  const hasContent = hasPlan || openTasks.length > 0 || hasProgress;
  const memberTotal = groupMemberCount(detail);
  const needCheckin = !detail.my_checked_in_today && (hasPlan || hasProgress);
  const planLabel = detail.plan_title?.trim() || (openTasks.length ? '今日任务' : '今日共读');
  const dayKey = localDayKey(new Date());
  const closeKey = `group-sticky-closed:${detail.id || ''}:${dayKey}`;
  const [closed, setClosed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!detail.id) {
      setReady(true);
      return;
    }
    try {
      setClosed(localStorage.getItem(closeKey) === '1');
    } catch {
      setClosed(false);
    }
    setReady(true);
  }, [detail.id, closeKey]);

  if (!hasContent || !ready || closed) return null;

  const closeBar = () => {
    setClosed(true);
    try {
      localStorage.setItem(closeKey, '1');
    } catch {
      /* ignore */
    }
  };

  const meta = needCheckin
    ? `待打卡 · ${checkedIn}/${memberTotal} 已打卡`
    : openTasks.length > 0
      ? `${checkedIn}/${memberTotal} 已打卡 · 任务 ${openTasks.length}`
      : `今日已完成 · ${checkedIn}/${memberTotal} 已打卡`;

  const cta = openTasks.length > 0 && onGoTask
    ? { label: '去完成', onClick: onGoTask, soft: false }
    : needCheckin
      ? { label: '去打卡', onClick: onCheckin, soft: false }
      : { label: '看打卡墙', onClick: onOpenWall || onOpenCard || onCheckin, soft: true };

  const announce = announcement?.trim();

  return (
    <div className={`group-coread-sticky group-sticky-zone${needCheckin ? '' : ' is-done'}`} role="status">
      <button
        type="button"
        className="group-coread-sticky-main"
        onClick={onOpenCard}
        aria-label="今日共读"
      >
        <strong className="group-coread-sticky-plan">{planLabel}</strong>
        <span className="muted group-coread-sticky-meta">{meta}</span>
      </button>
      <button
        type="button"
        className={`group-coread-sticky-cta${cta.soft ? ' is-soft' : ''}`}
        onClick={cta.onClick}
      >
        {cta.label}
      </button>
      <button
        type="button"
        className="group-coread-sticky-close"
        onClick={closeBar}
        aria-label="关闭今日共读条"
      >
        ×
      </button>
      {announce || prayerCount > 0 || (pinnedTitle && onOpenPinned) ? (
        <div className="group-coread-links">
          {announce && onOpenAnnounce ? (
            <button type="button" className="text-link" onClick={onOpenAnnounce}>
              公告
            </button>
          ) : null}
          {prayerCount > 0 && onOpenPrayer ? (
            <button type="button" className="text-link" onClick={onOpenPrayer}>
              代祷 {prayerCount}
            </button>
          ) : null}
          {pinnedTitle && onOpenPinned ? (
            <button type="button" className="text-link" onClick={onOpenPinned}>
              置顶任务
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
