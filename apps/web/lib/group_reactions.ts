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

export const LIKE_REACTION = '👍';

export function isCannedPhrase(key: string): boolean {
  return key.startsWith('phrase:');
}

export function cannedPhraseLabel(key: string): string {
  return GROUP_CANNED_PHRASES.find((p) => p.key === key)?.label ?? key;
}

/** 仅展示已有反应；点击可 +1。新反应走长按工具栏。 */
export function reactionBarEntries(
  reactions: Record<string, string[]> | null | undefined,
): Array<{ key: string; count: number }> {
  const map = reactions || {};
  const out: Array<{ key: string; count: number }> = [];
  for (const [key, users] of Object.entries(map)) {
    if (!users?.length) continue;
    out.push({ key, count: users.length });
  }
  out.sort((a, b) => b.count - a.count);
  return out;
}
