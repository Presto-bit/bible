import type { Group } from './api';
import { myTodayGroupStatus } from './group_status';

/** 发现群列表：未打卡 > 有任务 > 已完成；pending 乐观群仍置顶。 */
export function sortGroupsByActionPriority(groups: Group[], pendingOnlyIds: Set<string>): Group[] {
  const score = (g: Group): number => {
    if (pendingOnlyIds.has(g.id)) return -100;
    const st = myTodayGroupStatus(g);
    if (st === 'pending_checkin') return 0;
    if (st === 'has_tasks') return 1;
    if (st === 'checked') return 2;
    return 3;
  };
  return [...groups].sort((a, b) => {
    const sa = score(a);
    const sb = score(b);
    if (sa !== sb) return sa - sb;
    return a.name.localeCompare(b.name, 'zh-CN');
  });
}
