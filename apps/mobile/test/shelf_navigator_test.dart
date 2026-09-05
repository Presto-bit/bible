import 'package:flutter_test/flutter_test.dart';
import 'package:presto_bible/features/shelf/shelf_navigator.dart';

void main() {
  test('ShelfNavigator paths stay absolute and encoded', () {
    expect(ShelfNavigator.detailPath('abc'), '/shelf/abc');
    expect(
      ShelfNavigator.detailPath('a b', tab: 'notes', finished: true),
      '/shelf/a%20b?tab=notes&finished=1',
    );
    expect(ShelfNavigator.readPath('abc'), '/shelf/abc/read');
    expect(
      ShelfNavigator.readPath('abc', section: 's1', page: 2),
      '/shelf/abc/read?section=s1&page=2',
    );
  });
}
