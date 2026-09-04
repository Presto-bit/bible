/** 「我的」足迹回流角标与同行里程碑（仅本机） */

import { userLsGet, userLsSet } from '@/lib/user_storage';

const SEEN_KEY = 'profile_footprint_seen';
const MILESTONE_KEY = 'profile_streak_milestones_shared';

export type FootprintSeen = {
  thoughts: number;
  shelf: number;
  badges: number;
};

export const STREAK_MILESTONES = [7, 30, 100] as const;

export function readFootprintSeen(): FootprintSeen {
  if (typeof window === 'undefined') return { thoughts: 0, shelf: 0, badges: 0 };
  try {
    const raw = JSON.parse(userLsGet(SEEN_KEY) || '{}') as Partial<FootprintSeen>;
    return {
      thoughts: Number(raw.thoughts) || 0,
      shelf: Number(raw.shelf) || 0,
      badges: Number(raw.badges) || 0,
    };
  } catch {
    return { thoughts: 0, shelf: 0, badges: 0 };
  }
}

export function writeFootprintSeen(next: Partial<FootprintSeen>) {
  const cur = readFootprintSeen();
  const merged: FootprintSeen = {
    thoughts: next.thoughts ?? cur.thoughts,
    shelf: next.shelf ?? cur.shelf,
    badges: next.badges ?? cur.badges,
  };
  userLsSet(SEEN_KEY, JSON.stringify(merged));
}

export function footprintHasNew(
  kind: keyof FootprintSeen,
  current: number,
  seen?: FootprintSeen,
): boolean {
  const s = seen ?? readFootprintSeen();
  return current > 0 && current > s[kind];
}

export function markFootprintSeen(kind: keyof FootprintSeen, current: number) {
  writeFootprintSeen({ [kind]: current });
}

function readSharedMilestones(): number[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = JSON.parse(userLsGet(MILESTONE_KEY) || '[]') as number[];
    return Array.isArray(raw) ? raw.filter((n) => Number.isFinite(n)) : [];
  } catch {
    return [];
  }
}

/** 当前 streak 下尚未分享过的最高里程碑；无则 null */
export function pendingStreakMilestone(streak: number): number | null {
  if (streak <= 0) return null;
  const shared = new Set(readSharedMilestones());
  let hit: number | null = null;
  for (const m of STREAK_MILESTONES) {
    if (streak >= m && !shared.has(m)) hit = m;
  }
  return hit;
}

export function markStreakMilestoneShared(n: number) {
  const set = new Set(readSharedMilestones());
  set.add(n);
  userLsSet(MILESTONE_KEY, JSON.stringify([...set].sort((a, b) => a - b)));
}
