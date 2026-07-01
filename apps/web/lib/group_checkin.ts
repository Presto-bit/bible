/** 打卡快捷感想 chips（PRODUCT §5.4.3） */
export const GROUP_CHECKIN_CHIPS = [
  '很受触动 🙏',
  '为家人祷告',
  '愿与弟兄共勉',
  '完成今日打卡 ✓',
] as const;

export const GROUP_CHECKIN_DEFAULT_BODY = '完成今日打卡 ✓';

export function chapterRef(bookId: string, chapter: number, verse?: number): string {
  if (verse && verse > 0) return `${bookId}.${chapter}.${verse}`;
  return `${bookId}.${chapter}`;
}
