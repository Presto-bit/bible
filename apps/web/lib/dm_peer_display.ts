import type { ConversationItem, Friend } from '@/lib/api';
import { friendDisplayName } from '@/lib/friend_label';
import { dmTitleWithRemark } from '@/lib/friend_remarks';
import {
  isPlatformOfficialFriend,
  OFFICIAL_AVATAR_ID,
  OFFICIAL_DISPLAY_NAME,
} from '@/lib/official_support';

export function isOfficialDmPeer(args: {
  peerUserId?: string | null;
  peerAvatarId?: string | null;
  friend?: Pick<Friend, 'user_code' | 'relation' | 'avatar_id'> | null;
}): boolean {
  return isPlatformOfficialFriend({
    user_code: args.friend?.user_code,
    relation: args.friend?.relation,
    avatar_id: args.peerAvatarId ?? args.friend?.avatar_id,
  });
}

/** 私信顶栏 / 消息列表标题：官方固定「彼爱团队」，不受备注覆盖。 */
export function resolveDmPeerTitle(args: {
  peerUserId?: string | null;
  peerAvatarId?: string | null;
  friend?: Friend | null;
  apiTitle?: string | null;
}): string {
  if (isOfficialDmPeer(args)) return OFFICIAL_DISPLAY_NAME;
  const base = args.friend
    ? friendDisplayName(args.friend)
    : (args.apiTitle?.trim() || '私信');
  return dmTitleWithRemark(args.peerUserId, base);
}

export function dmConversationAvatarFriend(
  it: ConversationItem,
  friend?: Friend | null,
): Pick<Friend, 'user_id'> & { avatar_id?: string | null } {
  const uid = it.peer_user_id || it.ref_id;
  if (isOfficialDmPeer({ peerUserId: it.peer_user_id, peerAvatarId: it.peer_avatar_id, friend })) {
    return { user_id: uid, avatar_id: OFFICIAL_AVATAR_ID };
  }
  return {
    user_id: uid,
    avatar_id: friend?.avatar_id || it.peer_avatar_id,
  };
}
