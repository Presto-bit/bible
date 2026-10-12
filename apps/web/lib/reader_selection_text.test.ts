import { describe, expect, it } from 'vitest';
import {
  resolveSelectionTextForAi,
  versesForNativeLineHighlight,
} from './reader_selection_text';
import type { WordRange } from './selection_range';

const verses = [
  { verse: 1, text: '神爱世人，甚至将他的独生子赐给他们。' },
  { verse: 2, text: '叫一切信他的，不至灭亡，反得永生。' },
];

describe('resolveSelectionTextForAi', () => {
  it('returns exact wordRange text without expanding short picks', () => {
    const wordRange: WordRange = {
      anchor: { verse: 1, start: 0, end: 3 },
      focus: { verse: 1, start: 0, end: 3 },
    };
    expect(
      resolveSelectionTextForAi({
        verses,
        wholeVerseSel: [],
        wordRange,
        nativeTouchSelect: false,
        nativeSelection: null,
      }),
    ).toBe('神爱世');
  });

  it('returns native selection text as-is for partial picks', () => {
    expect(
      resolveSelectionTextForAi({
        verses,
        wholeVerseSel: [],
        wordRange: null,
        nativeTouchSelect: true,
        nativeSelection: { verses: [1], text: '神爱世' },
      }),
    ).toBe('神爱世');
  });

  it('returns whole verse only for explicit wholeVerseSel', () => {
    expect(
      resolveSelectionTextForAi({
        verses,
        wholeVerseSel: [1],
        wordRange: null,
        nativeTouchSelect: false,
        nativeSelection: null,
      }),
    ).toBe(verses[0]!.text);
  });
});

describe('versesForNativeLineHighlight', () => {
  it('never expands partial native selection to whole-verse line highlight', () => {
    expect(
      versesForNativeLineHighlight(verses, {
        verses: [1],
        text: '神爱世',
      }).size,
    ).toBe(0);
    expect(
      versesForNativeLineHighlight(verses, {
        verses: [1],
        text: verses[0]!.text,
      }).size,
    ).toBe(0);
  });
});
