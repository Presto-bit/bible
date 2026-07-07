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

const FULL_VERSE_RATIO = 0.85;

/** 选区文本是否覆盖经节绝大部分（才用整节高亮） */
export function nativeSelectionCoversVerses(
  verses: VerseSlice[],
  selection: NativeVerseSelection,
  ratio = FULL_VERSE_RATIO,
): boolean {
  const full = joinVerseTexts(verses, selection.verses);
  const picked = selection.text.trim();
  if (!full || !picked) return false;
  return picked.length >= full.length * ratio;
}

/** 触控原生划选：整节选中时对经节行加 verse-sel-active（有字符级 pin 时不用行级）。 */
export function versesForNativeLineHighlight(
  verses: VerseSlice[],
  selection: NativeVerseSelection | null,
): Set<number> {
  if (!selection || !nativeSelectionCoversVerses(verses, selection)) return new Set();
  return new Set(selection.verses);
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
    if (nativeSelectionCoversVerses(verses, nativeSelection)) return full;
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
