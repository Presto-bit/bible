import type { Group } from '@/lib/api';

export function groupStatusBadge(g: Group): string | null {
  if (g.plan_id) return '计划';
  if ((g.members ?? 0) >= 3) return '活跃';
  return null;
}
