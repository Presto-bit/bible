import { describe, expect, it } from 'vitest';
import { exploreReadBridge, firstManuscriptReadRef } from './explore_read_bridge';

describe('firstManuscriptReadRef', () => {
  it('picks the first beat ref', () => {
    expect(
      firstManuscriptReadRef({
        layout: {
          schema: 'knowledge_layout@1',
          id: 'paul-first-journey',
          source: { kind: 'map', id: 'paul-first-journey' },
          template: 'journey',
          blocks: [],
          beats: [
            { order: 1, label: '安提阿', ref: 'ACT 13:1' },
            { order: 2, label: '塞浦路斯', ref: 'ACT 13:4' },
          ],
        },
      }),
    ).toBe('ACT 13:1');
  });

  it('falls back to tour stops', () => {
    expect(
      firstManuscriptReadRef({
        layout: null,
        tour: {
          id: 'paul-first-journey',
          title: '保罗',
          stops: [{ order: 1, place_id: 'antioch', label: '安提阿', ref: 'ACT 13:1' }],
        },
      }),
    ).toBe('ACT 13:1');
  });

  it('returns null when empty', () => {
    expect(firstManuscriptReadRef(null)).toBeNull();
    expect(firstManuscriptReadRef({ layout: null, tour: null })).toBeNull();
  });
});

describe('exploreReadBridge', () => {
  it('maps USFM ref to reader href and Chinese label', () => {
    expect(exploreReadBridge('ACT 13:1')).toEqual({
      href: '/reader?book=ACT&chapter=13&verse=1',
      label: '使徒行传 13:1',
    });
  });

  it('returns null for blank', () => {
    expect(exploreReadBridge('')).toBeNull();
    expect(exploreReadBridge(null)).toBeNull();
  });
});
