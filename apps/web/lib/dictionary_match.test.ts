import { describe, expect, it } from 'vitest';
import { claimDictUnderline, properNounClass } from './dictionary_match';
import type { DictEntity } from '@/lib/api';

const person = (id: string, name: string): DictEntity =>
  ({
    id,
    name,
    type: 'person',
    summary: '简介',
    refs: ['JHN.1.1'],
  }) as DictEntity;

describe('claimDictUnderline', () => {
  it('同 id 仅首次为 true', () => {
    const seen = new Set<string>();
    expect(claimDictUnderline(seen, 'jesus')).toBe(true);
    expect(claimDictUnderline(seen, 'jesus')).toBe(false);
    expect(claimDictUnderline(seen, 'peter')).toBe(true);
    expect(seen).toEqual(new Set(['jesus', 'peter']));
  });

  it('表面字相同则去重（即使 entity id 不同）', () => {
    const seen = new Set<string>();
    expect(claimDictUnderline(seen, 'jesus', 't:耶稣')).toBe(true);
    expect(claimDictUnderline(seen, 'jesus-alt', 't:耶稣')).toBe(false);
  });
});

describe('properNounClass', () => {
  it('quiet 时无类型划线 class', () => {
    const e = person('jesus', '耶稣');
    expect(properNounClass(e)).toContain('proper-noun--person');
    expect(properNounClass(e, { showUnderline: false })).toBe(
      'proper-noun proper-noun--quiet',
    );
  });
});
