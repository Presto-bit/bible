/** 触控/PWA：读取系统原生划选，映射到经节号列表。 */

export type NativeVerseSelection = { verses: number[]; text: string };

/** 收起系统菜单后，按字符范围还原系统选区底色（非词块、非整行）。 */
export type NativePinnedSpan = { verse: number; start: number; end: number };

export type NativePinnedHighlight = NativeVerseSelection & {
  spans: NativePinnedSpan[];
};

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

function spansFromOffsets(
  root: HTMLElement,
  verses: number[],
  startVerse: number,
  endVerse: number,
  startOff: number,
  endOff: number,
): NativePinnedSpan[] {
  const spans: NativePinnedSpan[] = [];
  for (const verse of verses) {
    if (verse < startVerse || verse > endVerse) continue;
    const body = verseBodyElement(root, verse);
    if (!body) continue;
    const len = (body.textContent ?? '').length;
    let start = 0;
    let end = len;
    if (startVerse === endVerse) {
      start = startOff;
      end = endOff;
    } else if (verse === startVerse) {
      start = startOff;
      end = len;
    } else if (verse === endVerse) {
      start = 0;
      end = endOff;
    }
    start = Math.max(0, Math.min(start, len));
    end = Math.max(start, Math.min(end, len));
    if (end > start) {
      spans.push({ verse, start, end });
    }
  }
  return spans;
}

/**
 * 用选中文本在经节正文中定位字符范围（纯函数，便于单测）。
 * 只在能唯一/可靠匹配时返回 spans，避免误扩整节。
 */
export function recoverPinnedSpansFromVerseTexts(
  verseTexts: { verse: number; text: string }[],
  pickedRaw: string,
): NativePinnedSpan[] {
  const picked = pickedRaw.trim();
  if (!picked || !verseTexts.length) return [];
  const bodies = [...verseTexts]
    .filter((v) => v.text)
    .sort((a, b) => a.verse - b.verse);
  if (!bodies.length) return [];

  if (bodies.length === 1) {
    const { verse, text: full } = bodies[0]!;
    if (picked.length >= full.length && full.includes(picked.slice(0, full.length))) {
      return [{ verse, start: 0, end: full.length }];
    }
    const idx = full.indexOf(picked);
    if (idx < 0) return [];
    // 多处相同片段时不猜，交给上层保留旧 pin
    if (full.indexOf(picked, idx + 1) >= 0) return [];
    return [{ verse, start: idx, end: idx + picked.length }];
  }

  const joined = bodies.map((b) => b.text).join('');
  const idx = joined.indexOf(picked);
  if (idx < 0 || joined.indexOf(picked, idx + 1) >= 0) return [];

  const spans: NativePinnedSpan[] = [];
  let cursor = 0;
  const remainingStart = idx;
  const remainingEnd = idx + picked.length;
  for (const { verse, text } of bodies) {
    const next = cursor + text.length;
    const localStart = Math.max(0, remainingStart - cursor);
    const localEnd = Math.min(text.length, remainingEnd - cursor);
    if (localEnd > localStart) {
      spans.push({ verse, start: localStart, end: localEnd });
    }
    cursor = next;
  }
  return spans;
}

/**
 * DOM 选区已 collapse 时，用选中文本在经节正文中定位字符范围。
 */
export function recoverPinnedSpansFromText(
  root: HTMLElement | null,
  selection: NativeVerseSelection,
): NativePinnedSpan[] {
  if (!root || !selection.text.trim() || !selection.verses.length) return [];
  const verses = [...selection.verses].sort((a, b) => a - b);
  const verseTexts = verses.map((verse) => ({
    verse,
    text: verseBodyElement(root, verse)?.textContent ?? '',
  }));
  return recoverPinnedSpansFromVerseTexts(verseTexts, selection.text);
}

/** 在 removeAllRanges 前读取字符级高亮范围（与 DOM 选区一致）。 */
export function readNativePinnedHighlight(root: HTMLElement | null): NativePinnedHighlight | null {
  const basic = readNativeVerseSelection(root);
  if (!basic || typeof window === 'undefined') return null;

  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount < 1 || !root) return null;

  const anchorVerse = verseFromNode(sel.anchorNode, root);
  const focusVerse = verseFromNode(sel.focusNode, root);
  if (anchorVerse == null || focusVerse == null) {
    return { ...basic, spans: recoverPinnedSpansFromText(root, basic) };
  }

  const anchorBody = verseBodyElement(root, anchorVerse);
  const focusBody = verseBodyElement(root, focusVerse);
  if (!anchorBody || !focusBody) {
    return { ...basic, spans: recoverPinnedSpansFromText(root, basic) };
  }

  let startVerse = anchorVerse;
  let endVerse = focusVerse;
  let startOff = charOffsetInVerseBody(anchorBody, sel.anchorNode!, sel.anchorOffset);
  let endOff = charOffsetInVerseBody(focusBody, sel.focusNode!, sel.focusOffset);

  if (
    startVerse > endVerse
    || (startVerse === endVerse && startOff > endOff)
  ) {
    [startVerse, endVerse] = [endVerse, startVerse];
    [startOff, endOff] = [endOff, startOff];
  }

  const spans = spansFromOffsets(root, basic.verses, startVerse, endVerse, startOff, endOff);
  if (!spans.length) {
    return { ...basic, spans: recoverPinnedSpansFromText(root, basic) };
  }
  return { verses: basic.verses, text: basic.text, spans };
}
