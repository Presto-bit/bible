import type { HighlightColor } from './reader_highlights';

/** 划线颜色语义（微信读书式：颜色=分类）。 */
export const MARK_COLOR_SEMANTICS: Record<
  HighlightColor,
  { label: string; hint: string }
> = {
  yellow: { label: '金句', hint: '重点背诵、分享' },
  green: { label: '应许', hint: '安慰、祷告引用' },
  blue: { label: '教导', hint: '命令、查经对照' },
  pink: { label: '疑问', hint: '待查、问小爱' },
  orange: { label: '应用', hint: '个人灵修应用' },
};

export const MARK_COLORS: HighlightColor[] = [
  'yellow',
  'green',
  'blue',
  'pink',
  'orange',
];
