/** 触控划选 pin：用 CSS Highlight API 绘制底色，不改动经文 DOM 结构。 */

import type { NativePinnedHighlight } from '@/lib/native_verse_selection';

const HIGHLIGHT_NAME = 'verse-native-pinned';

function verseBodyElement(root: HTMLElement, verse: number): HTMLElement | null {
  return root.querySelector(`#verse-anchor-${verse} .verse-text-body`) as HTMLElement | null;
}

function rangeFromOffsets(
  root: HTMLElement,
  verse: number,
  start: number,
  end: number,
): Range | null {
  const body = verseBodyElement(root, verse);
  if (!body || end <= start) return null;

  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
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

export function supportsCssCustomHighlight(): boolean {
  return typeof CSS !== 'undefined' && 'highlights' in CSS;
}

export function clearNativePinnedHighlight(): void {
  if (!supportsCssCustomHighlight()) return;
  CSS.highlights.delete(HIGHLIGHT_NAME);
}

export function applyNativePinnedHighlight(
  root: HTMLElement | null,
  highlight: NativePinnedHighlight | null,
): boolean {
  clearNativePinnedHighlight();
  if (!root || !highlight?.spans.length || !supportsCssCustomHighlight()) return false;

  const ranges: Range[] = [];
  for (const span of highlight.spans) {
    const range = rangeFromOffsets(root, span.verse, span.start, span.end);
    if (range) ranges.push(range);
  }
  if (!ranges.length) return false;

  CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(...ranges));
  return true;
}
