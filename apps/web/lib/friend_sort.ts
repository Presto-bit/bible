import type { Friend } from '@/lib/api';
import { friendDisplayName } from '@/lib/friend_label';
import { friendRemarkOrName } from '@/lib/friend_remarks';

export function friendSortLabel(name: string): string {
  const ch = name.trim().charAt(0);
  if (/[A-Za-z]/.test(ch)) return ch.toUpperCase();
  if (/[\u4e00-\u9fff]/.test(ch)) return ch;
  return '#';
}

export function sortFriendsByName(friends: Friend[]): Friend[] {
  return [...friends].sort((a, b) =>
    friendRemarkOrName(a.user_id, friendDisplayName(a)).localeCompare(
      friendRemarkOrName(b.user_id, friendDisplayName(b)),
      'zh-CN',
    ),
  );
}

export function groupFriendsByLetter(friends: Friend[]): { letter: string; items: Friend[] }[] {
  const sorted = sortFriendsByName(friends);
  const map = new Map<string, Friend[]>();
  for (const f of sorted) {
    const label = friendSortLabel(friendRemarkOrName(f.user_id, friendDisplayName(f)));
    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(f);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'zh-CN'))
    .map(([letter, items]) => ({ letter, items }));
}
