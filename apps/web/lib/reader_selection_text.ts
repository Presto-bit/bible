import type { NativeVerseSelection } from '@/lib/native_verse_selection';
import { textFromWordRange, type WordRange } from '@/lib/selection_range';

type VerseSlice = { verse: number; text: string };

function joinVerseTexts(
  verses: VerseSlice[],
  verseNums: number[],
  formatVerse?: (verse: number, text: string) => string,
): string {
  const set = new Set(verseNums);
  return verses
    .filter((v) => set.has(v.verse))
    .sort((a, b) => a.verse - b.verse)
    .map((v) => (formatVerse ? formatVerse(v.verse, v.text) : v.text))
    .join('');
}

/** 选区文本是否覆盖经节绝大部分（仅作语义判断，不再驱动行级蓝底）。 */
export function nativeSelectionCoversVerses(
  verses: VerseSlice[],
  selection: NativeVerseSelection,
  ratio = 0.85,
): boolean {
  const full = joinVerseTexts(verses, selection.verses);
  const picked = selection.text.trim();
  if (!full || !picked) return false;
  return picked.length >= full.length * ratio;
}

/**
 * 触控原生划选：不再用 verse-sel-active 整节冒充局部选区。
 * 局部底色只走 CSS Highlight / 字符级 DOM 包裹。
 */
export function versesForNativeLineHighlight(
  _verses: VerseSlice[],
  _selection: NativeVerseSelection | null,
): Set<number> {
  return new Set();
}

/**
 * 问小爱用的选中文本：严格等于用户选区，不因短选区扩成整节。
 */
export function resolveSelectionTextForAi(opts: {
  verses: VerseSlice[];
  wholeVerseSel: number[];
  wordRange: WordRange | null;
  nativeTouchSelect: boolean;
  nativeSelection: NativeVerseSelection | null;
  formatVerse?: (verse: number, text: string) => string;
}): string {
  const { verses, wholeVerseSel, wordRange, nativeTouchSelect, nativeSelection, formatVerse } = opts;

  if (wholeVerseSel.length > 0) {
    return joinVerseTexts(verses, wholeVerseSel, formatVerse);
  }

  if (nativeTouchSelect && nativeSelection) {
    const picked = nativeSelection.text.trim();
    if (picked) return picked;
    return joinVerseTexts(verses, nativeSelection.verses, formatVerse);
  }

  if (wordRange) {
    return textFromWordRange(
      wordRange,
      (v) => verses.find((x) => x.verse === v)?.text ?? '',
    );
  }

  return '';
}
