/** 书架 HTML 正文选区 ↔ 字符偏移（用于划线/想法锚点）。 */

export type ShelfTextSelection = {
  start: number;
  end: number;
  text: string;
  rect: DOMRect;
};

function collectTextLength(root: HTMLElement): number {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let len = 0;
  let node = walker.nextNode();
  while (node) {
    len += (node.textContent || '').length;
    node = walker.nextNode();
  }
  return len;
}

function offsetBefore(root: HTMLElement, target: Node, offset: number): number {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let pos = 0;
  let node = walker.nextNode();
  while (node) {
    if (node === target) return pos + offset;
    pos += (node.textContent || '').length;
    node = walker.nextNode();
  }
  return pos;
}

export function rangeFromArticleOffsets(
  article: HTMLElement,
  start: number,
  end: number,
): Range | null {
  if (end <= start) return null;
  const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
  let pos = 0;
  let startNode: Text | null = null;
  let startOff = 0;
  let endNode: Text | null = null;
  let endOff = 0;

  let node = walker.nextNode() as Text | null;
  while (node) {
    const len = node.data.length;
    if (!startNode && pos + len > start) {
      startNode = node;
      startOff = Math.max(0, start - pos);
    }
    if (pos + len >= end) {
      endNode = node;
      endOff = Math.max(0, end - pos);
      break;
    }
    pos += len;
    node = walker.nextNode() as Text | null;
  }

  if (!startNode || !endNode) return null;
  try {
    const range = document.createRange();
    range.setStart(startNode, startOff);
    range.setEnd(endNode, endOff);
    return range;
  } catch {
    return null;
  }
}

export function readShelfTextSelection(article: HTMLElement | null): ShelfTextSelection | null {
  if (!article || typeof window === 'undefined') return null;
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount < 1) return null;

  const range = sel.getRangeAt(0);
  if (!article.contains(range.commonAncestorContainer)) return null;

  const text = sel.toString().replace(/\s+/g, ' ').trim();
  if (!text) return null;

  const start = offsetBefore(article, range.startContainer, range.startOffset);
  const end = offsetBefore(article, range.endContainer, range.endOffset);
  if (end <= start) return null;

  const rect = range.getBoundingClientRect();
  if (rect.width < 0.5 && rect.height < 0.5) return null;

  return { start, end, text, rect };
}

export function clearShelfTextSelection() {
  try {
    window.getSelection()?.removeAllRanges();
  } catch {
    /* ignore */
  }
}

export function articleTextLength(article: HTMLElement): number {
  return collectTextLength(article);
}
