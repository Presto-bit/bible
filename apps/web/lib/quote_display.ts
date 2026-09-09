/** 阅读显示层引号：直角「」→ 弯引号 ""（不改经文数据 / 复制默认原文）。 */

export type QuoteDisplayMode = 'source' | 'western';

const QUOTE_DISPLAY_KEY = 'reader_quote_display';

/** 直角 → 弯引号（逐字符 1:1，不改动节内字 offset） */
const CORNER_TO_WESTERN: Record<string, string> = {
  '「': '\u201C',
  '」': '\u201D',
  '『': '\u2018',
  '』': '\u2019',
};

export const QUOTE_DISPLAY_MODES: { id: QuoteDisplayMode; label: string; hint: string }[] = [
  { id: 'source', label: '直角引号', hint: '与纸书和经文数据一致（「」『』）' },
  { id: 'western', label: '弯引号', hint: '仅阅读显示为 “”‘’，复制仍为原文' },
];

export function getQuoteDisplayMode(): QuoteDisplayMode {
  if (typeof window === 'undefined') return 'source';
  const v = localStorage.getItem(QUOTE_DISPLAY_KEY);
  return v === 'western' ? 'western' : 'source';
}

export function setQuoteDisplayMode(mode: QuoteDisplayMode): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(QUOTE_DISPLAY_KEY, mode);
}

/** 仅当经节含直角引号且用户选择 western 时替换；CNV 等已是 “” 的不受影响。 */
export function formatQuotesForDisplay(
  text: string,
  mode: QuoteDisplayMode = getQuoteDisplayMode(),
): string {
  if (mode !== 'western' || !text) return text;
  if (!text.includes('「') && !text.includes('」') && !text.includes('『') && !text.includes('』')) {
    return text;
  }
  return text.replace(/[「」『』]/g, (ch) => CORNER_TO_WESTERN[ch] ?? ch);
}
