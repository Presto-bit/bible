import 'package:flutter_test/flutter_test.dart';
import 'package:presto_bible/features/shelf/shelf_mark_ref.dart';
import 'package:presto_bible/features/shelf/shelf_repository.dart';

void main() {
  test('shelf book share ref uses _book section', () {
    expect(shelfBookShareRef('abc'), 'SHELF.abc._book');
  });

  test('parseShelfMarkRef reads span and page', () {
    final p = parseShelfMarkRef('SHELF.book1.sec2.p3@10-20');
    expect(p, isNotNull);
    expect(p!.bookId, 'book1');
    expect(p.sectionId, 'sec2');
    expect(p.pageIndex, 3);
    expect(p.spanStart, 10);
    expect(p.spanEnd, 20);
  });
}
