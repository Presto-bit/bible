import type { Group, GroupDetail } from './api';

export type GroupTodayStatus = 'checked' | 'pending_checkin' | 'has_tasks' | 'all_done';

export function myTodayGroupStatus(g: Pick<Group, 'my_checked_in_today' | 'open_tasks' | 'plan_id'>): GroupTodayStatus {
  if (g.my_checked_in_today) return 'checked';
  if ((g.open_tasks ?? 0) > 0) return 'has_tasks';
  return 'pending_checkin';
}

export function myTodayGroupStatusLabel(status: GroupTodayStatus): string {
  switch (status) {
    case 'checked':
      return '我已打卡';
    case 'has_tasks':
      return '有待完成任务';
    default:
      return '待打卡';
  }
}

/** 发现页 / 群列表卡片主状态标签 */
export function groupListStatusBadge(g: Group): { label: string; tone: 'pending' | 'done' | 'task' | 'mine' } {
  const mine = myTodayGroupStatus(g);
  if (mine === 'checked') {
    return { label: '我已打卡 ✓', tone: 'done' };
  }
  if (mine === 'has_tasks') {
    return { label: `任务 ${g.open_tasks}`, tone: 'task' };
  }
  if ((g.open_tasks ?? 0) > 0) {
    return { label: `任务 ${g.open_tasks}`, tone: 'task' };
  }
  const members = g.members || 1;
  const checked = g.checked_in_today ?? 0;
  if (checked < members) {
    return { label: '待打卡', tone: 'pending' };
  }
  return { label: '今日已齐', tone: 'done' };
}

/** 列表卡片副标题：今日进度 + 计划进度 */
export function groupListSubline(g: Group): string {
  const members = g.members || 1;
  const checked = g.checked_in_today ?? 0;
  const parts: string[] = [`今日 ${checked}/${members}`];
  if (g.plan_id && (g.my_plan_day ?? 0) > 0 && (g.plan_days_total ?? 0) > 0) {
    parts.push(`我第 ${g.my_plan_day}/${g.plan_days_total} 天`);
  } else if (g.plan_title) {
    parts.push(g.plan_title);
  }
  if (!g.my_checked_in_today) {
    parts.push(myTodayGroupStatusLabel(myTodayGroupStatus(g)));
  }
  return parts.join(' · ');
}

export function groupDetailTodayLine(detail: GroupDetail): string {
  const members = detail.members?.length ?? detail.checked_in_today ?? 1;
  const checked = detail.checked_in_today ?? 0;
  return `今日 ${checked}/${members} 人已打卡`;
}
