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
}
