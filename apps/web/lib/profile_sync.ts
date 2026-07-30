import { enqueue } from './sync';
import { userLsGet, userLsSet } from './user_storage';
import { notifyLocalDataChanged } from './local_data_events';
import { normalizeCustomAvatarId } from './profile_avatar';

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
  const id = avatarId.trim();
  if (!id) return;
  // 禁止把本机 data URL 推上云
  if (id.startsWith('data:') || id.startsWith('u:data:')) return;
  const durable = normalizeCustomAvatarId(id);
  enqueue({
    entity: 'user_profile',
    op: 'update',
    data: { avatar_id: durable },
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
    let remote = data.avatar_id;
    // 自定义头像规范化为持久 key，避免短时签名链回写把头像「清掉」
    if (
      remote.startsWith('u:')
      || remote.startsWith('http')
      || remote.startsWith('data:')
    ) {
      remote = normalizeCustomAvatarId(remote);
    }
    if (local !== remote) {
      userLsSet(AVATAR_KEY, remote);
      changed = true;
    }
  }
  if (typeof data.username === 'string' && data.username.trim()) {
    const next = data.username.trim();
    // 已设密：勿被同步里的旧昵称覆盖当前账号用户名（刷新后「名字变回去」）
    const localName = (userLsGet(NAME_KEY) || '').trim();
    const secured = typeof window !== 'undefined' && localStorage.getItem('account_has_password') === '1';
    const shouldApply = !secured || !localName || localName === next;
    if (shouldApply && localName !== next) {
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
