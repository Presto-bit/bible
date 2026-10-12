import { describe, expect, it } from 'vitest';
import { boundsEmpty, mergeLineRects, wordRangeBounds } from './touch_verse_selection';
import { wordContainingOffset } from './verse_words';

describe('wordRangeBounds', () => {
  it('同节：取最小起点与最大终点（词锚 + 光标）', () => {
    const b = wordRangeBounds({
      anchor: { verse: 3, start: 4, end: 6 },
      focus: { verse: 3, start: 1, end: 1 },
    });
    expect(b).toEqual({ startVerse: 3, startOff: 1, endVerse: 3, endOff: 6 });
  });

  it('跨节反向拖动时归一化', () => {
    const b = wordRangeBounds({
      anchor: { verse: 5, start: 2, end: 4 },
      focus: { verse: 4, start: 7, end: 7 },
    });
    expect(b.startVerse).toBe(4);
    expect(b.endVerse).toBe(5);
    expect(boundsEmpty(b)).toBe(false);
  });
});

describe('mergeLineRects', () => {
  it('同一行重叠盒子合并为一块，不同行分开', () => {
    const out = mergeLineRects([
      { left: 10, top: 100, right: 40, bottom: 120 },
      { left: 38, top: 99, right: 80, bottom: 121 },
      { left: 0, top: 130, right: 50, bottom: 150 },
    ]);
    expect(out).toEqual([
      { left: 10, top: 99, right: 80, bottom: 121 },
      { left: 0, top: 130, right: 50, bottom: 150 },
    ]);
  });

  it('丢弃零宽矩形', () => {
    expect(mergeLineRects([{ left: 5, top: 0, right: 5, bottom: 20 }])).toEqual([]);
  });
});

describe('wordContainingOffset', () => {
  it('标点退化为单字', () => {
    const text = '起初，神创造天地。';
    expect(wordContainingOffset(text, 2)).toEqual({ text: '，', start: 2, end: 3 });
  });

  it('落在词内返回整词且不超过原文', () => {
    const text = '起初，神创造天地。';
    const w = wordContainingOffset(text, 4)!;
    expect(w.start).toBeLessThanOrEqual(4);
    expect(w.end).toBeGreaterThan(4);
    expect(text.slice(w.start, w.end)).toBe(w.text);
  });
});
