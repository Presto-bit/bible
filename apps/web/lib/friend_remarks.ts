const KEY = 'friend_remarks_v1';

type RemarkMap = Record<string, string>;

function load(): RemarkMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as RemarkMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function save(map: RemarkMap) {
  localStorage.setItem(KEY, JSON.stringify(map));
}

export function getFriendRemark(friendId: string): string {
  return load()[friendId] ?? '';
}

export function setFriendRemark(friendId: string, remark: string) {
  const map = load();
  const trimmed = remark.trim();
  if (!trimmed) delete map[friendId];
  else map[friendId] = trimmed;
  save(map);
}

export function friendRemarkOrName(
  friendId: string,
  displayName: string,
): string {
  return getFriendRemark(friendId) || displayName;
}
