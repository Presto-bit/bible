import type { GroupDetail, GroupMember, GroupMessage } from './api';
import { localDayKey } from './group_ui';

export interface CheckinPoster {
  member: GroupMember;
  message?: GroupMessage;
  status: 'pinned' | 'pending';
}

function memberKeys(member: GroupMember): string[] {
  const keys: string[] = [];
  if (member.user_id) keys.push(member.user_id);
  if (member.is_me) keys.push('__me__');
  const name = (member.name || '').trim();
  if (name) keys.push(`name:${name}`);
  return keys;
}

function messageKeys(m: GroupMessage): string[] {
  const keys: string[] = [];
  if (m.user_id) keys.push(m.user_id);
  if (m.mine) keys.push('__me__');
  const author = (m.author || '').trim();
  if (author) keys.push(`name:${author}`);
  return keys;
}

export function buildCheckinPosters(
  detail: GroupDetail,
  messages: GroupMessage[],
  dayKey = localDayKey(new Date()),
): CheckinPoster[] {
  const members = detail.members ?? [];
  const todayCheckins = messages.filter(
    (m) => m.kind === 'checkin' && localDayKey(m.created_at) === dayKey,
  );
  const byUser = new Map<string, GroupMessage>();
  for (const m of todayCheckins) {
    for (const key of messageKeys(m)) {
      const prev = byUser.get(key);
      if (!prev || m.created_at > prev.created_at) byUser.set(key, m);
    }
  }

  const posters: CheckinPoster[] = members.map((member) => {
    let message: GroupMessage | undefined;
    for (const key of memberKeys(member)) {
      const hit = byUser.get(key);
      if (hit) {
        message = hit;
        break;
      }
    }
    if (message || member.checked_in_today) {
      return { member, message, status: 'pinned' as const };
    }
    return { member, status: 'pending' as const };
  });

  posters.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'pinned' ? -1 : 1;
    if (a.status === 'pinned' && b.status === 'pinned') {
      const ta = a.message?.created_at ?? '';
      const tb = b.message?.created_at ?? '';
      if (ta && tb && ta !== tb) return ta.localeCompare(tb);
    }
    if (a.member.is_me) return -1;
    if (b.member.is_me) return 1;
    return 0;
  });
  return posters;
}

export function posterBodyPreview(body?: string | null, max = 48): string {
  const text = (body || '完成今日打卡 ✓').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

export function posterTimeLabel(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
