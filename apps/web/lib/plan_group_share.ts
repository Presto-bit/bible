import { api, type Group } from './api';

/** 当前用户可绑定计划的群（群主或管理员）。 */
export async function loadOwnerGroups(): Promise<Group[]> {
  const { groups } = await api.myGroups();
  return groups.filter((g) => g.role === 'owner' || g.role === 'admin');
}

export function groupsBoundToPlan(groups: Group[], planId: string): Group[] {
  return groups.filter((g) => g.plan_id === planId);
}

/** 将计划绑定到已有群（群主/管理员）。 */
export async function bindPlanToGroup(gid: string, planId: string): Promise<void> {
  await api.updateGroup(gid, { plan_id: planId });
}

export function groupCheckinHref(gid: string, ref?: string): string {
  const params = new URLSearchParams({ focus: 'checkin' });
  if (ref) params.set('ref', ref);
  return `/discover/group/${encodeURIComponent(gid)}?${params.toString()}`;
}
