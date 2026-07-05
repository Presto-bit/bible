/** 经节文本按词切分（用于触控划词，绕过移动端整句扩选） */

export type VerseWordSlice = { text: string; start: number; end: number };

export function sliceVerseWords(text: string): VerseWordSlice[] {
  const out: VerseWordSlice[] = [];
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const seg = new Intl.Segmenter('zh', { granularity: 'word' });
    let cursor = 0;
    for (const part of seg.segment(text)) {
      const t = part.segment;
      const start = text.indexOf(t, cursor);
      const end = start + t.length;
      cursor = end;
      if (!t.trim()) continue;
      out.push({ text: t, start, end });
    }
    if (out.length) return out;
  }
  const re = /[\u4e00-\u9fff]+|[A-Za-z0-9]+|[^\s\u4e00-\u9fffA-Za-z0-9]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const t = m[0];
    if (!t.trim()) continue;
    out.push({ text: t, start: m.index, end: m.index + t.length });
  }
  return out;
}
