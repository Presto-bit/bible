/** 触控/PWA：读取系统原生划选，映射到经节号列表。 */

import { sliceVerseWords } from '@/lib/verse_words';
import type { WordAnchor, WordRange } from '@/lib/selection_range';

export type NativeVerseSelection = { verses: number[]; text: string };

function verseFromAnchorId(id: string | null | undefined): number | null {
  if (!id) return null;
  const m = id.match(/^verse-anchor-(\d+)$/);
  if (!m) return null;
  const v = Number(m[1]);
  return Number.isFinite(v) && v > 0 ? v : null;
}

function verseFromNode(node: Node | null, root: HTMLElement): number | null {
  let el: Element | null =
    node instanceof Element ? node : node?.parentElement ?? null;
  while (el && el !== root) {
    const v = verseFromAnchorId(el.id);
    if (v != null) return v;
    el = el.parentElement;
  }
  return null;
}

export function readNativeVerseSelection(root: HTMLElement | null): NativeVerseSelection | null {
  if (!root || typeof window === 'undefined') return null;
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount < 1) return null;
  if (!root.contains(sel.anchorNode) || !root.contains(sel.focusNode)) return null;

  const text = sel.toString().replace(/\s+/g, ' ').trim();
  if (!text) return null;

  const verses = new Set<number>();
  const a = verseFromNode(sel.anchorNode, root);
  const f = verseFromNode(sel.focusNode, root);
  if (a != null) verses.add(a);
  if (f != null) verses.add(f);

  try {
    const range = sel.getRangeAt(0);
    root.querySelectorAll('[id^="verse-anchor-"]').forEach((el) => {
      if (range.intersectsNode(el)) {
        const v = verseFromAnchorId(el.id);
        if (v != null) verses.add(v);
      }
    });
  } catch {
    /* intersectsNode may throw on detached nodes */
  }

  const sorted = [...verses].sort((x, y) => x - y);
  if (!sorted.length) return null;
  return { verses: sorted, text };
}

function verseBodyElement(root: HTMLElement, verse: number): HTMLElement | null {
  return root.querySelector(`#verse-anchor-${verse} .verse-text-body`) as HTMLElement | null;
}

function charOffsetInVerseBody(body: HTMLElement, container: Node, offset: number): number {
  try {
    const range = document.createRange();
    range.selectNodeContents(body);
    range.setEnd(container, offset);
    return range.toString().length;
  } catch {
    return 0;
  }
}

function wordAnchorAtOffset(verse: number, text: string, charOffset: number): WordAnchor {
  const words = sliceVerseWords(text);
  if (!words.length) {
    const end = Math.max(0, Math.min(charOffset, text.length));
    return { verse, start: 0, end: end || text.length };
  }
  const clamped = Math.max(0, Math.min(charOffset, text.length));
  for (const w of words) {
    if (clamped >= w.start && clamped <= w.end) {
      return { verse, start: w.start, end: w.end };
    }
  }
  let chosen = words[0]!;
  for (const w of words) {
    if (w.start <= clamped) chosen = w;
    else break;
  }
  return { verse, start: chosen.start, end: chosen.end };
}

/** 收起系统菜单前，把 DOM 选区映射为词级范围以保留应用内高亮。 */
export function readNativeWordRange(
  root: HTMLElement,
  verseText: (verse: number) => string,
): WordRange | null {
  if (typeof window === 'undefined') return null;
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount < 1) return null;
  if (!root.contains(sel.anchorNode) || !root.contains(sel.focusNode)) return null;

  const anchorVerse = verseFromNode(sel.anchorNode, root);
  const focusVerse = verseFromNode(sel.focusNode, root);
  if (anchorVerse == null || focusVerse == null) return null;

  const anchorBody = verseBodyElement(root, anchorVerse);
  const focusBody = verseBodyElement(root, focusVerse);
  if (!anchorBody || !focusBody) return null;

  const anchor = wordAnchorAtOffset(
    anchorVerse,
    verseText(anchorVerse),
    charOffsetInVerseBody(anchorBody, sel.anchorNode!, sel.anchorOffset),
  );
  const focus = wordAnchorAtOffset(
    focusVerse,
    verseText(focusVerse),
    charOffsetInVerseBody(focusBody, sel.focusNode!, sel.focusOffset),
  );

  return { anchor, focus };
}
