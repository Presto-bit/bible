/** 对照译本措辞差异（轻量 LCS，按节计算，可缓存）。 */

export type DiffSide = 'main' | 'parallel';

export type DiffSpan = {
  start: number;
  end: number;
  side: DiffSide;
};

export type VerseDiffResult = {
  main: DiffSpan[];
  parallel: DiffSpan[];
  /** 差异过多时降级为整节提示 */
  heavy: boolean;
};

const MAX_SPANS = 40;
const PUNCT_RE = /[\s\u3000，。！？、；：""''（）【】《》…—\-.,!?;:'"()[\]{}]/g;

function normalizeChar(ch: string): string | null {
  if (PUNCT_RE.test(ch)) return null;
  return ch;
}

function tokenize(text: string): { chars: string[]; indexMap: number[] } {
  const chars: string[] = [];
  const indexMap: number[] = [];
  const arr = [...(text || '')];
  for (let i = 0; i < arr.length; i += 1) {
    const n = normalizeChar(arr[i]!);
    if (n == null) continue;
    chars.push(n);
    indexMap.push(i);
  }
  return { chars, indexMap };
}

/** 简单 LCS 标记：不在 LCS 中的 token 视为差异。 */
function lcsMask(a: string[], b: string[]): { aKeep: boolean[]; bKeep: boolean[] } {
  const n = a.length;
  const m = b.length;
  // 过长节：跳过精细 diff，避免 O(nm) 卡顿
  if (n * m > 12_000) {
    return {
      aKeep: a.map(() => true),
      bKeep: b.map(() => true),
    };
  }
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = 1; i <= n; i += 1) {
    const ai = a[i - 1];
    const row = dp[i]!;
    const prev = dp[i - 1]!;
    for (let j = 1; j <= m; j += 1) {
      row[j] = ai === b[j - 1] ? (prev[j - 1]! + 1) : Math.max(prev[j]!, row[j - 1]!);
    }
  }
  const aKeep = Array(n).fill(false);
  const bKeep = Array(m).fill(false);
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      aKeep[i - 1] = true;
      bKeep[j - 1] = true;
      i -= 1;
      j -= 1;
    } else if ((dp[i - 1]![j] ?? 0) >= (dp[i]![j - 1] ?? 0)) {
      i -= 1;
    } else {
      j -= 1;
    }
  }
  return { aKeep, bKeep };
}

function maskToSpans(
  keep: boolean[],
  indexMap: number[],
  side: DiffSide,
): DiffSpan[] {
  const spans: DiffSpan[] = [];
  let i = 0;
  while (i < keep.length) {
    if (keep[i]) {
      i += 1;
      continue;
    }
    const startTok = i;
    while (i < keep.length && !keep[i]) i += 1;
    const endTok = i - 1;
    const start = indexMap[startTok]!;
    const end = indexMap[endTok]! + 1;
    spans.push({ start, end, side });
  }
  return spans;
}

export function diffVerseTexts(mainText: string, parallelText: string): VerseDiffResult {
  const a = tokenize(mainText);
  const b = tokenize(parallelText);
  if (!a.chars.length || !b.chars.length) {
    return { main: [], parallel: [], heavy: false };
  }
  if (a.chars.length * b.chars.length > 12_000) {
    return { main: [], parallel: [], heavy: true };
  }
  const { aKeep, bKeep } = lcsMask(a.chars, b.chars);
  let main = maskToSpans(aKeep, a.indexMap, 'main');
  let parallel = maskToSpans(bKeep, b.indexMap, 'parallel');
  const heavy = main.length + parallel.length > MAX_SPANS;
  if (heavy) {
    main = [];
    parallel = [];
  }
  return { main, parallel, heavy };
}

const memCache = new Map<string, VerseDiffResult>();
const MEM_MAX = 240;

export function cachedVerseDiff(
  key: string,
  mainText: string,
  parallelText: string,
): VerseDiffResult {
  const hit = memCache.get(key);
  if (hit) return hit;
  const result = diffVerseTexts(mainText, parallelText);
  if (memCache.size >= MEM_MAX) {
    const first = memCache.keys().next().value;
    if (first != null) memCache.delete(first);
  }
  memCache.set(key, result);
  return result;
}

export function clearVerseDiffCache() {
  memCache.clear();
}

/** 同文种粗判：双方都含大量 CJK 或都不含。 */
export function sameScriptRoughly(a: string, b: string): boolean {
  const cjk = (t: string) => (/[\u4e00-\u9fff]/.test(t) ? 1 : 0);
  return cjk(a) === cjk(b);
}

export function renderTextWithDiffSpans(
  text: string,
  spans: DiffSpan[],
): { key: string; text: string; diff: boolean }[] {
  if (!spans.length) return [{ key: 'all', text, diff: false }];
  const sorted = [...spans].sort((x, y) => x.start - y.start);
  const parts: { key: string; text: string; diff: boolean }[] = [];
  let cursor = 0;
  sorted.forEach((s, idx) => {
    if (s.start > cursor) {
      parts.push({ key: `t${idx}`, text: text.slice(cursor, s.start), diff: false });
    }
    parts.push({ key: `d${idx}`, text: text.slice(s.start, s.end), diff: true });
    cursor = s.end;
  });
  if (cursor < text.length) {
    parts.push({ key: 'tail', text: text.slice(cursor), diff: false });
  }
  return parts.filter((p) => p.text);
}
