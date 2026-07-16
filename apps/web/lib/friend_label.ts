import type { Friend, FriendRequestItem } from '@/lib/api';
import { isPlaceholderDisplayName } from '@/lib/group_ui';

/**
 * 好友展示名：真实昵称 > 用户名(handle) > 用户 ID。
 * 「读经伙伴/群友」等占位不当作昵称。
 */
export function friendDisplayName(
  f: Pick<Friend, 'display_name' | 'handle' | 'user_id' | 'user_code'>,
  fallback = '好友',
): string {
  const name = (f.display_name || '').trim();
  if (name && !isPlaceholderDisplayName(name)) return name;
  if (f.handle?.trim()) return f.handle.trim();
  if (f.user_code?.trim()) return f.user_code.trim();
  if (f.user_id && /^\d{8,10}$/.test(f.user_id)) return f.user_id;
  return fallback;
}

/** 好友申请列表展示名：昵称 > 用户名 > 用户 ID。 */
export function friendRequestLabel(r: FriendRequestItem): string {
  const name = (r.display_name || '').trim();
  if (name && !isPlaceholderDisplayName(name)) return name;
  if (r.handle?.trim()) return `@${r.handle.trim()}`;
  if (r.user_code?.trim()) return `ID ${r.user_code.trim()}`;
  const peer = r.to_user_id || r.from_user_id;
  if (peer && /^\d{8,10}$/.test(peer)) return `ID ${peer}`;
  return '书友';
}
