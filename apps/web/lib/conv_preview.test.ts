import { describe, expect, it } from 'vitest';
import { splitConvKind } from './conv_preview';

describe('splitConvKind', () => {
  it('strips a kind prefix and keeps the sender', () => {
    expect(splitConvKind('我: [打卡] 创世记 1')).toEqual({
      kind: '打卡',
      text: '我: 创世记 1',
    });
  });

  it('leaves plain chat unchanged', () => {
    expect(splitConvKind('晚安')).toEqual({ kind: null, text: '晚安' });
  });
});
