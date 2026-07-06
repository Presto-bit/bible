import type { Friend } from '@/lib/api';

export function friendDisplayName(
  f: Pick<Friend, 'display_name' | 'handle' | 'user_id'>,
  fallback = '好友',
): string {
  return (f.display_name || f.handle || `用户${f.user_id.slice(0, 4)}`).trim() || fallback;
}
