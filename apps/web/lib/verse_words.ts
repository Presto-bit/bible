/** 经节文本按词切分（用于触控划词，绕过移动端整句扩选） */

export type VerseWordSlice = { text: string; start: number; end: number };

export function sliceVerseWords(text: string): VerseWordSlice[] {
  const out: VerseWordSlice[] = [];
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const seg = new Intl.Segmenter('zh', { granularity: 'word' });
    let cursor = 0;
    let pending = '';
    let pendingStart = -1;
    const flush = () => {
      if (!pending.trim() || pendingStart < 0) {
        pending = '';
        pendingStart = -1;
        return;
      }
      out.push({ text: pending, start: pendingStart, end: pendingStart + pending.length });
      pending = '';
      pendingStart = -1;
    };
    for (const part of seg.segment(text)) {
      const t = part.segment;
      const start = text.indexOf(t, cursor);
      const end = start + t.length;
      cursor = end;
      if (!t.trim()) {
        flush();
        continue;
      }
      // 中文单字在 Segmenter 下很常见；合并相邻单字为词组，减少「逐字蓝块」与拖动卡顿
      const isSingleCjk = /^[\u4e00-\u9fff]$/.test(t);
      if (isSingleCjk) {
        if (pendingStart < 0) pendingStart = start;
        pending += t;
        if (pending.length >= 4) flush();
        continue;
      }
      flush();
      out.push({ text: t, start, end });
    }
    flush();
    if (out.length) return out;
  }
  const re = /[\u4e00-\u9fff]{1,4}|[A-Za-z0-9]+|[^\s\u4e00-\u9fffA-Za-z0-9]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const t = m[0];
    if (!t.trim()) continue;
    out.push({ text: t, start: m.index, end: m.index + t.length });
  }
  return out;
}
