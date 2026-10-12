import { describe, expect, it } from 'vitest';
import {
  pinnedSpanBounds,
  recoverPinnedSpansFromVerseTexts,
} from './native_verse_selection';

describe('recoverPinnedSpansFromVerseTexts', () => {
  it('recovers unique single-verse substring offsets', () => {
    expect(
      recoverPinnedSpansFromVerseTexts(
        [{ verse: 1, text: '神爱世人，甚至将他的独生子赐给他们。' }],
        '神爱世',
      ),
    ).toEqual([{ verse: 1, start: 0, end: 3 }]);
  });

  it('uses the first occurrence when the snippet appears more than once', () => {
    expect(
      recoverPinnedSpansFromVerseTexts(
        [{ verse: 1, text: '爱是恒久忍耐，又有恩慈；爱是不嫉妒。' }],
        '爱是',
      ),
    ).toEqual([{ verse: 1, start: 0, end: 2 }]);
  });

  it('recovers cross-verse contiguous selection', () => {
    expect(
      recoverPinnedSpansFromVerseTexts(
        [
          { verse: 1, text: '上头' },
          { verse: 2, text: '下头续' },
        ],
        '头下头',
      ),
    ).toEqual([
      { verse: 1, start: 1, end: 2 },
      { verse: 2, start: 0, end: 2 },
    ]);
  });
});

describe('pinnedSpanBounds', () => {
  it('reads start/end from multi-span pin', () => {
    expect(
      pinnedSpanBounds([
        { verse: 2, start: 0, end: 3 },
        { verse: 1, start: 4, end: 8 },
      ]),
    ).toEqual({
      startVerse: 1,
      startOff: 4,
      endVerse: 2,
      endOff: 3,
    });
  });

  it('returns null for empty spans', () => {
    expect(pinnedSpanBounds([])).toBeNull();
  });
});
