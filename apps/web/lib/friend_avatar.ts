import { defaultAvatarId } from '@/components/Avatar';

export function friendAvatarId(user: {
  user_id: string;
  avatar_id?: string | null;
  author_avatar_id?: string | null;
}): string {
  const id = user.avatar_id ?? user.author_avatar_id;
  if (id) return id;
  return defaultAvatarId(user.user_id);
}
