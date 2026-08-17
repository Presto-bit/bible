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

  test('dictListRevision 随词条变化', () {
    expect(dictListRevision(const []), 0);
    final a = dictListRevision([entity('a', '耶稣')]);
    final b = dictListRevision([entity('b', '耶稣')]);
    expect(a, isNot(b));
  });
}
