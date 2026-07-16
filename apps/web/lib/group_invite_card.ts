/** 群邀请文案 / 卡片字段（站内外统一）。 */
export type GroupInviteCardData = {
  groupName: string;
  intro?: string | null;
  planTitle?: string | null;
  planDayLine?: string | null;
  checkedInToday?: number;
  memberTotal?: number;
  joinCode: string;
};

export function groupInviteIntro(intro?: string | null): string {
  const t = (intro || '').trim();
  return t || '一起读经打卡';
}

export function groupInviteReadingLine(data: GroupInviteCardData): string {
  if (data.planDayLine?.trim()) return data.planDayLine.trim();
  if (data.planTitle?.trim()) return data.planTitle.trim();
  return '自由共读';
}

export function groupInviteCheckinLine(data: GroupInviteCardData): string {
  const x = data.checkedInToday ?? 0;
  const y = data.memberTotal ?? 0;
  if (y > 0) return `今日已有 ${x}/${y} 人打卡`;
  return `今日已有 ${x} 人打卡`;
}

export function buildGroupInviteShareText(data: GroupInviteCardData): string {
  const code = (data.joinCode || '').trim().toUpperCase();
  return [
    `邀请你加入共读群「${data.groupName}」`,
    groupInviteIntro(data.intro),
    `本周在读：${groupInviteReadingLine(data)}`,
    groupInviteCheckinLine(data),
    `邀请码：${code}`,
    '打开圣经 App → 发现 → 加入群，输入邀请码即可。',
  ].join('\n');
}
