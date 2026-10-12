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

export type PinnedEdgeBounds = {
  startVerse: number;
  startOff: number;
  endVerse: number;
  endOff: number;
};

/** pin spans 的起止字符边界（用于拖动手柄扩选）。 */
export function pinnedSpanBounds(spans: NativePinnedSpan[]): PinnedEdgeBounds | null {
  if (!spans.length) return null;
  const sorted = [...spans].sort((a, b) =>
    a.verse !== b.verse ? a.verse - b.verse : a.start - b.start,
  );
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  return {
    startVerse: first.verse,
    startOff: first.start,
    endVerse: last.verse,
    endOff: last.end,
  };
}

function textFromPinnedSpans(root: HTMLElement, spans: NativePinnedSpan[]): string {
  const sorted = [...spans].sort((a, b) =>
    a.verse !== b.verse ? a.verse - b.verse : a.start - b.start,
  );
  let out = '';
  for (const span of sorted) {
    const body = verseBodyElement(root, span.verse);
    const full = body?.textContent ?? '';
    out += full.slice(span.start, span.end);
  }
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * 用起止字符边界重建 pin（拖动手柄时调用）。
 * 保证 start≤end；跨节时中间节取全文。
 */
export function rebuildPinnedFromEdges(
  root: HTMLElement | null,
  startVerse: number,
  startOff: number,
  endVerse: number,
  endOff: number,
): NativePinnedHighlight | null {
  if (!root) return null;
  let sV = startVerse;
  let eV = endVerse;
  let sOff = Math.max(0, startOff);
  let eOff = Math.max(0, endOff);
  if (sV > eV || (sV === eV && sOff > eOff)) {
    [sV, eV] = [eV, sV];
    [sOff, eOff] = [eOff, sOff];
  }
  // 至少保留 1 字符，避免拖空导致工具条消失
  if (sV === eV && eOff <= sOff) {
    const body = verseBodyElement(root, sV);
    const len = (body?.textContent ?? '').length;
    if (len <= 0) return null;
    if (sOff >= len) {
      sOff = Math.max(0, len - 1);
      eOff = len;
    } else {
      eOff = Math.min(len, sOff + 1);
    }
  }
  const verses = Array.from({ length: eV - sV + 1 }, (_, i) => sV + i);
  const spans = spansFromOffsets(root, verses, sV, eV, sOff, eOff);
  if (!spans.length) return null;
  const text = textFromPinnedSpans(root, spans);
  if (!text) return null;
  return { verses, text, spans };
}

/** 触点映射到某节正文内的字符偏移（扩选拖动手柄）。 */
export function verseCharAtPoint(
  root: HTMLElement | null,
  x: number,
  y: number,
): { verse: number; offset: number } | null {
  if (!root || typeof document === 'undefined') return null;
  const doc = root.ownerDocument;
  let range: Range | null = null;
  if (typeof doc.caretRangeFromPoint === 'function') {
    range = doc.caretRangeFromPoint(x, y);
  } else {
    const pos = (
      doc as Document & {
        caretPositionFromPoint?: (px: number, py: number) => { offsetNode: Node; offset: number } | null;
      }
    ).caretPositionFromPoint?.(x, y);
    if (pos) {
      range = doc.createRange();
      range.setStart(pos.offsetNode, pos.offset);
      range.collapse(true);
    }
  }
  if (!range) return null;
  const node = range.startContainer;
  if (!root.contains(node)) return null;
  const verse = verseFromNode(node, root);
  if (verse == null) return null;
  const body = verseBodyElement(root, verse);
  if (!body) return null;
  // 点到节号等正文外节点：落到最近正文
  if (!body.contains(node) && node !== body) {
    const len = (body.textContent ?? '').length;
    const bodyRect = body.getBoundingClientRect();
    const offset = x < bodyRect.left + bodyRect.width / 2 ? 0 : len;
    return { verse, offset };
  }
  return { verse, offset: charOffsetInVerseBody(body, node, range.startOffset) };
}

export type SelHandlePoint = { x: number; y: number; h: number };

/** 根据 `.verse-sel-chars` 量测起止手柄锚点（fixed 坐标）。 */
export function measureSelHandlePositions(
  root: HTMLElement | null,
): { start: SelHandlePoint; end: SelHandlePoint } | null {
  if (!root) return null;
  const nodes = root.querySelectorAll('.verse-sel-chars');
  if (!nodes.length) return null;
  const first = nodes[0] as HTMLElement;
  const last = nodes[nodes.length - 1] as HTMLElement;
  const firstRects = first.getClientRects();
  const lastRects = last.getClientRects();
  if (!firstRects.length || !lastRects.length) return null;
  const a = firstRects[0]!;
  const b = lastRects[lastRects.length - 1]!;
  return {
    start: { x: a.left, y: a.top, h: a.height || 18 },
    end: { x: b.right, y: b.top, h: b.height || 18 },
  };
}

/** 无精确 spans 时，用整节正文合成可拖 pin（兜底手柄）。 */
export function synthesizeFullVerseSpans(
  root: HTMLElement | null,
  verses: number[],
  text: string,
): NativePinnedHighlight | null {
  if (!root || !verses.length) return null;
  const spans: NativePinnedSpan[] = [];
  for (const verse of verses) {
    const body = verseBodyElement(root, verse);
    const len = (body?.textContent ?? '').length;
    if (len > 0) spans.push({ verse, start: 0, end: len });
  }
  if (!spans.length) return null;
  return {
    verses: [...verses].sort((a, b) => a - b),
    text: text.trim() || textFromPinnedSpans(root, spans),
    spans,
  };
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
    // 多处相同片段：仍取首次，保证 PWA pin 有可见底色（优于整节扩选）
    return [{ verse, start: idx, end: idx + picked.length }];
  }

  const joined = bodies.map((b) => b.text).join('');
  const idx = joined.indexOf(picked);
  if (idx < 0) return [];

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
