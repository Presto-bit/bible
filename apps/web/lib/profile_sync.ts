import { enqueue } from './sync';
import { userLsGet, userLsSet } from './user_storage';

const AVATAR_KEY = 'profile_avatar';

export function pushProfileAvatar(avatarId: string) {
  enqueue({
    entity: 'user_profile',
    op: 'update',
    data: { avatar_id: avatarId },
    client_ts: new Date().toISOString(),
  });
}

export function applyRemoteProfile(data?: { avatar_id?: string | null } | null) {
  if (!data?.avatar_id || typeof window === 'undefined') return;
  const local = userLsGet(AVATAR_KEY);
  if (local === data.avatar_id) return;
  userLsSet(AVATAR_KEY, data.avatar_id);
}

export function getLocalAvatarId(): string | null {
  if (typeof window === 'undefined') return null;
  return userLsGet(AVATAR_KEY);
}
