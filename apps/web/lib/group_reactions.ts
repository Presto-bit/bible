/** 群/私信结构化回应：常用 emoji（飞书式快捷栏） */
export const GROUP_EMOJIS = [
  '🙏', '❤️', '👍', '🔥', '🙌', '😊',
  '😢', '🎉', '✝️', '💪', '⭐', '💯',
] as const;

export const GROUP_CANNED_PHRASES = [
  { key: 'phrase:cheer', label: '为你加油' },
  { key: 'phrase:together', label: '一起坚持' },
  { key: 'phrase:remember', label: '记得你' },
  { key: 'phrase:amen', label: '阿们' },
  { key: 'phrase:bless', label: '愿神祝福' },
] as const;

export function isCannedPhrase(key: string): boolean {
  return key.startsWith('phrase:');
}

export function cannedPhraseLabel(key: string): string {
  return GROUP_CANNED_PHRASES.find((p) => p.key === key)?.label ?? key;
}
