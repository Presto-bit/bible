import { enqueue } from './sync';

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
  const local = localStorage.getItem(AVATAR_KEY);
  if (local === data.avatar_id) return;
  localStorage.setItem(AVATAR_KEY, data.avatar_id);
}

export function getLocalAvatarId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(AVATAR_KEY);
}
