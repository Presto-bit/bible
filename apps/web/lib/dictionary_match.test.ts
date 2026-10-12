import { describe, expect, it } from 'vitest';
import {
  buildChapterDictUnderlinePlan,
  buildChapterScopedClaimedBefore,
  claimDictUnderline,
  claimTieredDictUnderline,
  properNounClass,
} from './dictionary_match';
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

describe('claimTieredDictUnderline', () => {
  it('高频跨节只标首次，非常高频每节可再标', () => {
    const chapterSeen = new Set<string>();
    const v1 = new Set<string>();
    expect(claimTieredDictUnderline(v1, chapterSeen, 'jesus', '耶稣')).toBe(true);
    expect(claimTieredDictUnderline(v1, chapterSeen, 'peter', '彼得')).toBe(true);

    const v2 = new Set<string>();
    expect(claimTieredDictUnderline(v2, chapterSeen, 'jesus', '耶稣')).toBe(false);
    expect(claimTieredDictUnderline(v2, chapterSeen, 'peter', '彼得')).toBe(true);
  });
});

describe('buildChapterDictUnderlinePlan', () => {
  it('耶稣章内只首次，彼得节内首次', () => {
    const index = new Map<string, DictEntity[]>([
      ['耶稣', [person('jesus', '耶稣')]],
      ['彼得', [person('peter', '彼得')]],
    ]);
    const plan = buildChapterDictUnderlinePlan(
      [
        { verse: 1, text: '耶稣对彼得说' },
        { verse: 2, text: '耶稣又对彼得说' },
      ],
      index,
      'MAT',
      16,
    );
    expect(plan.showAt.get('1|0')).toBe(true); // 耶稣
    expect(plan.showAt.get('1|3')).toBe(true); // 彼得
    expect(plan.showAt.get('2|0')).toBe(false); // 耶稣章内已见
    expect(plan.showAt.get('2|4')).toBe(true); // 彼得新节
  });
});

describe('buildChapterScopedClaimedBefore', () => {
  it('第二节起已含高频键', () => {
    const index = new Map<string, DictEntity[]>([
      ['耶稣', [person('jesus', '耶稣')]],
    ]);
    const before = buildChapterScopedClaimedBefore(
      [
        { verse: 1, text: '耶稣来了' },
        { verse: 2, text: '耶稣又来了' },
      ],
      index,
      'JHN',
      1,
    );
    expect(before.get(1)?.has('jesus')).toBe(false);
    expect(before.get(2)?.has('jesus')).toBe(true);
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
