import { describe, expect, it } from 'vitest';
import type { KnowledgeLayoutSummary } from './api';
import { pickExploreSpotlightLayout } from './explore_spotlight';

function row(
  id: string,
  extra: Partial<KnowledgeLayoutSummary> = {},
): KnowledgeLayoutSummary {
  return { id, title: id, ...extra };
}

describe('pickExploreSpotlightLayout', () => {
  it('prefers paul even when not first', () => {
    const picked = pickExploreSpotlightLayout([
      row('exodus-wilderness'),
      row('paul-first-journey', { source: { kind: 'map', id: 'paul-first-journey' } }),
    ]);
    expect(picked?.id).toBe('paul-first-journey');
  });

  it('falls back to first journey before notes', () => {
    const picked = pickExploreSpotlightLayout([
      row('note-alpha', { kind: 'note' }),
      row('exodus-wilderness'),
    ]);
    expect(picked?.id).toBe('exodus-wilderness');
  });
});
