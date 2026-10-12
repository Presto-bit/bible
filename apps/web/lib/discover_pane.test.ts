import { describe, expect, it } from 'vitest';
import { defaultDiscoverPane, parseDiscoverPane } from './discover_pane';

describe('parseDiscoverPane', () => {
  it('accepts explore aliases', () => {
    expect(parseDiscoverPane('explore')).toBe('explore');
    expect(parseDiscoverPane('探索')).toBe('explore');
  });

  it('accepts peers aliases including legacy messages', () => {
    expect(parseDiscoverPane('peers')).toBe('peers');
    expect(parseDiscoverPane('同路人')).toBe('peers');
    expect(parseDiscoverPane('messages')).toBe('peers');
  });
});

describe('defaultDiscoverPane', () => {
  it('sends people with friends to 同路人', () => {
    expect(defaultDiscoverPane(1)).toBe('peers');
  });

  it('sends people without friends to 探索', () => {
    expect(defaultDiscoverPane(0)).toBe('explore');
  });
});
