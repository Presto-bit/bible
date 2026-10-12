/** 触控/PWA 应用内选区：几何与文本（不改经文 DOM，底色由叠加层绘制）。 */

import { normalizeWordRange, type WordRange } from '@/lib/selection_range';

export type SelBounds = {
  startVerse: number;
  startOff: number;
  endVerse: number;
  endOff: number;
};

export type SelRect = { left: number; top: number; right: number; bottom: number };

/** wordRange → 起止字符边界（start ≤ end）。 */
export function wordRangeBounds(range: WordRange): SelBounds {
  const { anchor, focus } = normalizeWordRange(range);
  if (anchor.verse === focus.verse) {
    return {
      startVerse: anchor.verse,
      startOff: Math.min(anchor.start, focus.start),
      endVerse: anchor.verse,
      endOff: Math.max(anchor.end, focus.end),
    };
  }
  return {
    startVerse: anchor.verse,
    startOff: anchor.start,
    endVerse: focus.verse,
    endOff: focus.end,
  };
}

/**
 * 同一行的矩形合并成一条（内联元素的盒子会互相重叠，半透明底色叠加后深浅不一）。
 * 输入为视口坐标。
 */
export function mergeLineRects(rects: SelRect[]): SelRect[] {
  const list = rects
    .filter((r) => r.right - r.left > 0.5 && r.bottom - r.top > 0.5)
    .sort((a, b) => a.top - b.top || a.left - b.left);
  const lines: SelRect[] = [];
  for (const r of list) {
    const h = r.bottom - r.top;
    const line = lines.find((l) => {
      const overlap = Math.min(l.bottom, r.bottom) - Math.max(l.top, r.top);
      return overlap > Math.min(h, l.bottom - l.top) * 0.5;
    });
    if (line) {
      line.left = Math.min(line.left, r.left);
      line.right = Math.max(line.right, r.right);
      line.top = Math.min(line.top, r.top);
      line.bottom = Math.max(line.bottom, r.bottom);
    } else {
      lines.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
    }
  }
  return lines.sort((a, b) => a.top - b.top || a.left - b.left);
}

export function verseBody(root: ParentNode, verse: number): HTMLElement | null {
  return root.querySelector(`#verse-anchor-${verse} .verse-text-body`) as HTMLElement | null;
}

/** 正文内第 offset 个字符所在的文本节点位置。 */
function locateOffset(body: HTMLElement, offset: number): { node: Node; offset: number } | null {
  const walker = body.ownerDocument.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  let remaining = Math.max(0, offset);
  let last: Text | null = null;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n as Text;
    const len = t.data.length;
    if (remaining <= len) return { node: t, offset: remaining };
    remaining -= len;
    last = t;
  }
  return last ? { node: last, offset: last.data.length } : null;
}

/** 每节正文各建一个 Range（不含节号 sup）。 */
export function verseRangesForBounds(root: HTMLElement, b: SelBounds): Range[] {
  const out: Range[] = [];
  for (let v = b.startVerse; v <= b.endVerse; v += 1) {
    const body = verseBody(root, v);
    if (!body) continue;
    const len = (body.textContent ?? '').length;
    const s = v === b.startVerse ? b.startOff : 0;
    const e = v === b.endVerse ? b.endOff : len;
    if (e <= s) continue;
    const a = locateOffset(body, s);
    const z = locateOffset(body, Math.min(e, len));
    if (!a || !z) continue;
    try {
      const r = body.ownerDocument.createRange();
      r.setStart(a.node, a.offset);
      r.setEnd(z.node, z.offset);
      out.push(r);
    } catch {
      /* 节点在重渲染中被替换 */
    }
  }
  return out;
}

export function selectionRects(root: HTMLElement, b: SelBounds): SelRect[] {
  const raw: SelRect[] = [];
  for (const r of verseRangesForBounds(root, b)) {
    for (const c of Array.from(r.getClientRects())) {
      raw.push({ left: c.left, top: c.top, right: c.right, bottom: c.bottom });
    }
  }
  return mergeLineRects(raw);
}

/** 选中文本：逐节取正文切片，不带节号。 */
export function selectionText(root: HTMLElement, b: SelBounds): string {
  let out = '';
  for (let v = b.startVerse; v <= b.endVerse; v += 1) {
    const full = verseBody(root, v)?.textContent ?? '';
    const s = v === b.startVerse ? b.startOff : 0;
    const e = v === b.endVerse ? b.endOff : full.length;
    out += full.slice(s, e);
  }
  return out.replace(/\s+/g, ' ').trim();
}

export function boundsEmpty(b: SelBounds): boolean {
  return b.startVerse === b.endVerse && b.endOff <= b.startOff;
}
