import { enqueue } from './sync';
import { userLsGet, userLsSet } from './user_storage';
import { notifyLocalDataChanged } from './local_data_events';

const AVATAR_KEY = 'profile_avatar';
const NAME_KEY = 'profile_name';
const BIO_KEY = 'profile_bio';

export type UserProfilePayload = {
  avatar_id?: string | null;
  bio?: string | null;
  username?: string | null;
  user_code?: string | null;
};

export function pushProfileAvatar(avatarId: string) {
  enqueue({
    entity: 'user_profile',
    op: 'update',
    data: { avatar_id: avatarId },
    client_ts: new Date().toISOString(),
  });
}

export function pushProfileName(username: string) {
  const u = username.trim();
  if (!u) return;
  enqueue({
    entity: 'user_profile',
    op: 'update',
    data: { username: u },
    client_ts: new Date().toISOString(),
  });
}

export function pushProfileBio(bio: string) {
  enqueue({
    entity: 'user_profile',
    op: 'update',
    data: { bio: bio.trim() },
    client_ts: new Date().toISOString(),
  });
}

export function applyRemoteProfile(data?: UserProfilePayload | null) {
  if (!data || typeof window === 'undefined') return;
  let changed = false;
  if (data.avatar_id) {
    const local = userLsGet(AVATAR_KEY);
    if (local !== data.avatar_id) {
      userLsSet(AVATAR_KEY, data.avatar_id);
      changed = true;
    }
  }
  if (typeof data.username === 'string' && data.username.trim()) {
    const next = data.username.trim();
    if (userLsGet(NAME_KEY) !== next) {
      userLsSet(NAME_KEY, next);
      changed = true;
    }
  }
  if (typeof data.bio === 'string') {
    const next = data.bio;
    if ((userLsGet(BIO_KEY) || '') !== next) {
      userLsSet(BIO_KEY, next);
      changed = true;
    }
  }
  if (changed) notifyLocalDataChanged('profile-pull');
}

export function getLocalAvatarId(): string | null {
  if (typeof window === 'undefined') return null;
  return userLsGet(AVATAR_KEY);
}
