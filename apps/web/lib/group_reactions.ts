/** 群/私信结构化回应：常用 emoji（飞书式快捷栏） */
export const GROUP_EMOJIS = [
  '🙏', '❤️', '👍', '🔥', '🙌', '😊',
  '😢', '🎉', '✝️', '💪', '⭐', '💯',
] as const;

/** 短语回应（可多人点击同一项累加） */
export const GROUP_CANNED_PHRASES = [
  { key: 'phrase:cheer', label: '为你加油' },
  { key: 'phrase:together', label: '一起坚持' },
  { key: 'phrase:remember', label: '记得你' },
  { key: 'phrase:amen', label: '阿们' },
  { key: 'phrase:bless', label: '愿神祝福' },
] as const;

/** 消息下方常驻、可点击累加的快捷表情 */
export const QUICK_REACTION_EMOJIS = ['🙏', '❤️', '👍', '🔥', '🙌', '😊'] as const;

/** @deprecated 用 QUICK_REACTION_EMOJIS；保留兼容 */
export const LIKE_REACTION = '👍';

export function isCannedPhrase(key: string): boolean {
  return key.startsWith('phrase:');
}

export function cannedPhraseLabel(key: string): string {
  return GROUP_CANNED_PHRASES.find((p) => p.key === key)?.label ?? key;
}

/** 汇总条展示顺序：常驻快捷表情 + 其它已有反应（含短语） */
export function reactionBarEntries(
  reactions: Record<string, string[]> | null | undefined,
): Array<{ key: string; count: number; pinned: boolean }> {
  const map = reactions || {};
  const pinned = new Set<string>(QUICK_REACTION_EMOJIS);
  const out: Array<{ key: string; count: number; pinned: boolean }> = [];
  for (const key of QUICK_REACTION_EMOJIS) {
    out.push({ key, count: (map[key] || []).length, pinned: true });
  }
  for (const [key, users] of Object.entries(map)) {
    if (pinned.has(key) || !users.length) continue;
    out.push({ key, count: users.length, pinned: false });
  }
  return out;
}
