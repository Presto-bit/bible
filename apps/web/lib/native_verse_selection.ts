/** 触控/PWA：读取系统原生划选，映射到经节号列表。 */

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
