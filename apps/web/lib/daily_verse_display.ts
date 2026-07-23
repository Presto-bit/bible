/** 每日经文展示：装饰引号，避免源文已有直角引号时出现。」」 */

export function formatDailyVerseQuote(text: string): string {
  const inner = text
    .trim()
    .replace(/^[「『]+/u, '')
    .replace(/[」』]+$/u, '');
  return `「${inner}」`;
}
