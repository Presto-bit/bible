import { userLsGet, userLsSet } from './user_storage';

const KEY = 'friend_remarks_v1';
export const FRIEND_REMARKS_EVENT = 'presto-friend-remarks-changed';

type RemarkMap = Record<string, string>;

function load(): RemarkMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = userLsGet(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as RemarkMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function save(map: RemarkMap) {
  userLsSet(KEY, JSON.stringify(map));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(FRIEND_REMARKS_EVENT));
  }
}

export function getFriendRemark(friendId: string): string {
  if (!friendId) return '';
  return load()[friendId] ?? '';
}

export function setFriendRemark(friendId: string, remark: string) {
  if (!friendId) return;
  const map = load();
  const trimmed = remark.trim();
  if (!trimmed) delete map[friendId];
  else map[friendId] = trimmed;
  save(map);
}

/** 有备注用备注，否则用传入的展示名。 */
export function friendRemarkOrName(
  friendId: string | null | undefined,
  displayName: string,
): string {
  if (!friendId) return displayName;
  return getFriendRemark(friendId) || displayName;
}

/** 会话列表 / 私信顶栏：DM 优先显示本地备注。 */
export function dmTitleWithRemark(
  peerUserId: string | null | undefined,
  fallbackTitle: string,
): string {
  return friendRemarkOrName(peerUserId, fallbackTitle);
}
