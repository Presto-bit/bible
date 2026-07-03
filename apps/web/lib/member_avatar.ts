import { defaultAvatarId } from '@/components/Avatar';
import type { GroupMember } from './api';

const PROFILE_AVATAR_KEY = 'profile_avatar';

/** 群成员展示用头像 id：本人读本地 profile，他人按 user_id 稳定映射预设头像。 */
export function memberAvatarId(member: GroupMember): string {
  if (member.avatar_id) return member.avatar_id;
  if (member.is_me && typeof window !== 'undefined') {
    const local = localStorage.getItem(PROFILE_AVATAR_KEY)?.trim();
    if (local) return local;
  }
  return defaultAvatarId(member.user_id || member.name || 'member');
}
