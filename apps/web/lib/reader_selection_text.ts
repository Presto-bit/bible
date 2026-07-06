import type { NativeVerseSelection } from '@/lib/native_verse_selection';
import { textFromWordRange, normalizeWordRange, type WordRange } from '@/lib/selection_range';

type VerseSlice = { verse: number; text: string };

function joinVerseTexts(verses: VerseSlice[], verseNums: number[]): string {
  const set = new Set(verseNums);
  return verses
    .filter((v) => set.has(v.verse))
    .sort((a, b) => a.verse - b.verse)
    .map((v) => v.text)
    .join('');
}

/**
 * 问小爱用的选中文本：视觉整节高亮时传整节经文，避免 sel.toString() 只剩一个字。
 */
export function resolveSelectionTextForAi(opts: {
  verses: VerseSlice[];
  wholeVerseSel: number[];
  wordRange: WordRange | null;
  nativeTouchSelect: boolean;
  nativeSelection: NativeVerseSelection | null;
}): string {
  const { verses, wholeVerseSel, wordRange, nativeTouchSelect, nativeSelection } = opts;

  if (wholeVerseSel.length > 0) {
    return joinVerseTexts(verses, wholeVerseSel);
  }

  if (nativeTouchSelect && nativeSelection) {
    const full = joinVerseTexts(verses, nativeSelection.verses);
    const picked = nativeSelection.text.trim();
    if (!picked) return full;
    if (full && picked.length < full.length * 0.85) return full;
    return picked;
  }

  if (wordRange) {
    const rangeText = textFromWordRange(
      wordRange,
      (v) => verses.find((x) => x.verse === v)?.text ?? '',
    );
    const { verses: nums, anchor } = normalizeWordRange(wordRange);
    const full = joinVerseTexts(verses, nums);
    if (full && rangeText.length < full.length * 0.85) {
      const oneVerse = verses.find((x) => x.verse === anchor.verse)?.text ?? '';
      if (rangeText.length <= 4 && oneVerse.length > rangeText.length * 2) {
        return nums.length === 1 ? oneVerse : full;
      }
    }
    return rangeText;
  }

  return '';
}
