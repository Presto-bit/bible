import 'package:flutter_test/flutter_test.dart';
import 'package:presto_bible/features/bible/content_repository.dart';
import 'package:presto_bible/features/bible/dictionary_match.dart';

void main() {
  DictEntity entity(String id, String name) => DictEntity(
    id: id,
    name: name,
    type: 'person',
    summary: '简介',
    refs: const ['JHN.1.1'],
  );

  test('cachedDictSpansForText 同键复用切分结果', () {
    final index = buildDictIndex([entity('e1', '耶稣')]);
    final keys = dictSortedKeys(index);
    final a = cachedDictSpansForText(
      '耶稣爱世人',
      index,
      keys,
      bookId: 'JHN',
      chapter: 3,
      verse: 16,
      dictRev: 1,
    );
    final b = cachedDictSpansForText(
      '耶稣爱世人',
      index,
      keys,
      bookId: 'JHN',
      chapter: 3,
      verse: 16,
      dictRev: 1,
    );
    expect(identical(a, b), isTrue);
    expect(a, isNotEmpty);
    expect(a.first.name, '耶稣');
  });

  test('cachedDictSpansForText 词典修订后失效', () {
    final index = buildDictIndex([entity('e1', '耶稣')]);
    final keys = dictSortedKeys(index);
    final a = cachedDictSpansForText(
      '耶稣爱世人',
      index,
      keys,
      bookId: 'JHN',
      chapter: 3,
      verse: 16,
      dictRev: 1,
    );
    final b = cachedDictSpansForText(
      '耶稣爱世人',
      index,
      keys,
      bookId: 'JHN',
      chapter: 3,
      verse: 16,
      dictRev: 2,
    );
    expect(identical(a, b), isFalse);
    expect(b.first.name, '耶稣');
  });

  test('低置信地点名不链正文', () {
    final index = buildDictIndex([
      DictEntity(
        id: '迦南',
        name: '迦南',
        type: 'place',
        summary: '应许之地',
        refs: const ['GEN.12:7'],
        scopeBooks: const ['GEN'],
        testament: 'OT',
      ),
      DictEntity(
        id: 'canaan-person',
        name: '迦南',
        type: 'person',
        summary: '含的儿子',
        refs: const ['GEN.9:18'],
        scopeBooks: const ['GEN'],
        testament: 'OT',
      ),
    ]);
    final keys = dictSortedKeys(index);
    final spans = dictSpansForText(
      '他到了迦南地',
      index,
      keys,
      bookId: 'REV',
      chapter: 1,
      verse: 1,
    );
    expect(spans, isEmpty);
  });

  test('语境明确时仍链地点', () {
    final index = buildDictIndex([
      DictEntity(
        id: '迦南',
        name: '迦南',
        type: 'place',
        summary: '应许之地',
        refs: const ['GEN.12:7'],
        scopeBooks: const ['GEN'],
        testament: 'OT',
      ),
    ]);
    final keys = dictSortedKeys(index);
    final spans = dictSpansForText(
      '他到了迦南地',
      index,
      keys,
      bookId: 'GEN',
      chapter: 12,
      verse: 7,
    );
    expect(spans, isNotEmpty);
    expect(spans.first.entity.type, 'place');
  });

  test('同词条每节仅首次显式划线', () {
    final index = buildDictIndex([entity('jesus', '耶稣')]);
    final keys = dictSortedKeys(index);
    final spans = dictSpansForText(
      '耶稣看见他们，耶稣就对他们说',
      index,
      keys,
      bookId: 'JHN',
      chapter: 1,
      verse: 38,
    );
    expect(spans.length, 2);
    expect(spans.where((s) => s.showUnderline), hasLength(1));
    expect(spans.first.showUnderline, isTrue);
    expect(spans.last.showUnderline, isFalse);
    expect(spans.every((s) => s.entity.id == 'jesus'), isTrue);
  });

  test('不同词条各留首次划线', () {
    final index = buildDictIndex([
      entity('jesus', '耶稣'),
      entity('peter', '彼得'),
    ]);
    final keys = dictSortedKeys(index);
    final spans = dictSpansForText(
      '耶稣对彼得说，耶稣又对彼得说',
      index,
      keys,
      bookId: 'MAT',
      chapter: 16,
      verse: 18,
    );
    expect(spans.length, 4);
    expect(spans.where((s) => s.showUnderline).map((s) => s.entity.id).toSet(), {
      'jesus',
      'peter',
    });
    expect(spans.where((s) => s.showUnderline), hasLength(2));
  });

  test('匹配层跨节仍各自标记（章级去重在 Plan）', () {
    final index = buildDictIndex([entity('jesus', '耶稣')]);
    final keys = dictSortedKeys(index);
    final v1 = dictSpansForText(
      '耶稣来了',
      index,
      keys,
      bookId: 'JHN',
      chapter: 1,
      verse: 1,
    );
    final v2 = dictSpansForText(
      '耶稣又来了',
      index,
      keys,
      bookId: 'JHN',
      chapter: 1,
      verse: 2,
    );
    expect(v1.single.showUnderline, isTrue);
    expect(v2.single.showUnderline, isTrue);
  });

  test('分层：高频章内只首次，其余节内首次', () {
    final index = buildDictIndex([
      entity('jesus', '耶稣'),
      entity('peter', '彼得'),
    ]);
    final keys = dictSortedKeys(index);
    final plan = buildChapterDictUnderlinePlan(
      verses: [
        (verse: 1, text: '耶稣对彼得说'),
        (verse: 2, text: '耶稣又对彼得说'),
      ],
      index: index,
      sortedKeys: keys,
      bookId: 'MAT',
      chapter: 16,
    );
    expect(plan.show(verse: 1, start: 0), isTrue); // 耶稣
    expect(plan.show(verse: 1, start: 3), isTrue); // 彼得
    expect(plan.show(verse: 2, start: 0), isFalse); // 耶稣章内已见
    expect(plan.show(verse: 2, start: 4), isTrue); // 彼得新节
  });

  test('claimTieredDictUnderline 高频走章桶', () {
    final chapterSeen = <String>{};
    final v1 = <String>{};
    expect(
      claimTieredDictUnderline(
        verseSeen: v1,
        chapterSeen: chapterSeen,
        entityId: 'jesus',
        surfaceName: '耶稣',
      ),
      isTrue,
    );
    final v2 = <String>{};
    expect(
      claimTieredDictUnderline(
        verseSeen: v2,
        chapterSeen: chapterSeen,
        entityId: 'jesus',
        surfaceName: '耶稣',
      ),
      isFalse,
    );
    expect(
      claimTieredDictUnderline(
        verseSeen: v2,
        chapterSeen: chapterSeen,
        entityId: 'peter',
        surfaceName: '彼得',
      ),
      isTrue,
    );
  });
}
