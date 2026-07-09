import { enqueue } from './sync';
import { loadBadgeStats, markBadgeToasted, stampBadgeUnlock } from './badge_events';
import { normalizeBadgeId } from './badge_catalog';

export function pushBadgeUnlock(badgeId: string, unlockedAt: number) {
  const id = normalizeBadgeId(badgeId);
  if (!id || !unlockedAt) return;
  enqueue({
    entity: 'badge_unlock',
    op: 'update',
    id,
    version: 1,
    client_ts: new Date(unlockedAt).toISOString(),
    data: { badge_id: id, unlocked_at: unlockedAt },
  });
}

export function applyRemoteBadgeUnlock(data?: {
  badge_id?: string;
  unlocked_at?: number;
} | null, opts?: { silent?: boolean }) {
  const badgeId = data?.badge_id ? normalizeBadgeId(data.badge_id) : '';
  const at = data?.unlocked_at;
  if (!badgeId || !at) return;
  const stats = loadBadgeStats();
  const prev = stats.unlocked_at[badgeId];
  const merged = prev ? Math.min(prev, at) : at;
  if (prev === merged) {
    if (opts?.silent) markBadgeToasted(badgeId);
    return;
  }
  stampBadgeUnlock(badgeId, merged);
  if (opts?.silent) markBadgeToasted(badgeId);
}

export function bulkPushLocalBadgeUnlocks(badgeIds: { id: string; unlockedAt: number }[]) {
  for (const b of badgeIds) {
    pushBadgeUnlock(b.id, b.unlockedAt);
  }
}
