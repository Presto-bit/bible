import { describe, expect, it } from 'vitest';
import type { ChapterDisplayPayload } from './reader_chapter_load';

describe('ChapterDisplayPayload shape', () => {
  it('documents empty-alt banner contract', () => {
    const sample: ChapterDisplayPayload = {
      layoutVerses: [{ verse: 1, text: '起初' }],
      verses: [],
      emptyAltBanner: 'NIV 暂无经文，请稍后刷新或换译本',
    };
    expect(sample.emptyAltBanner?.includes('暂无经文')).toBe(true);
    expect(sample.layoutVerses).toHaveLength(1);
  });
});
