import { api, ensureAccountReady } from '@/lib/api';
import { markRouteNavigation } from '@/lib/pwa_tab_nav';

/** 彼爱团队官方账号（帮助与反馈、欢迎信、全员触达） */
export const OFFICIAL_SUPPORT_USER_CODE = '70625146';
export const OFFICIAL_DISPLAY_NAME = '彼爱团队';
export const OFFICIAL_AVATAR_ID = 'official_app';
export const OFFICIAL_APP_ICON = '/apple-touch-icon.png';

export type FriendRelation = 'platform_official' | undefined;

export function isOfficialSupportCode(code: string | null | undefined): boolean {
  return (code || '').trim() === OFFICIAL_SUPPORT_USER_CODE;
}

/** 合成好友或 API 返回 relation 字段 */
export function isPlatformOfficialFriend(friend: {
  user_code?: string | null;
  relation?: string | null;
  avatar_id?: string | null;
}): boolean {
  if (friend.relation === 'platform_official') return true;
  if (isOfficialSupportCode(friend.user_code)) return true;
  return friend.avatar_id === OFFICIAL_AVATAR_ID;
}

/** 打开与彼爱团队的私信（自动建会话并触发服务端欢迎 notice）。 */
export async function navigateToOfficialDm(router: {
  push: (href: string) => void;
}): Promise<void> {
  await ensureAccountReady();
  const dm = await api.openDm(OFFICIAL_SUPPORT_USER_CODE);
  markRouteNavigation();
  router.push(`/discover/dm/${dm.thread_id}`);
}
