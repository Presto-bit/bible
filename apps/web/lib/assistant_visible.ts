import { bodyText } from '@/lib/assistant_format';

/** 流式是否已有可见正文（有内容即隐藏思考行）。 */
export function hasVisibleAnswerContent(text: string, minChars = 8): boolean {
  const t = bodyText(text).trim();
  if (t.length >= minChars) return true;
  return /(?:^|\n)###\s+\S+\s*\n+\S/m.test(t);
}
