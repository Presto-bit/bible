/** 群消息结构化回应：emoji + 罐头短语（B1，非自由聊天） */
export const GROUP_EMOJIS = ['🙏', '❤️', '👍', '🔥', '🙌'] as const;

export const GROUP_CANNED_PHRASES = [
  { key: 'phrase:cheer', label: '为你加油' },
  { key: 'phrase:together', label: '一起坚持' },
  { key: 'phrase:remember', label: '记得你' },
] as const;

export function isCannedPhrase(key: string): boolean {
  return key.startsWith('phrase:');
}

export function cannedPhraseLabel(key: string): string {
  return GROUP_CANNED_PHRASES.find((p) => p.key === key)?.label ?? key;
}
