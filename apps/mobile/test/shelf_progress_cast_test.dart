import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:presto_bible/features/shelf/shelf_progress.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('clearFinished tolerates jsonDecode Map<dynamic,dynamic>', () async {
    SharedPreferences.setMockInitialValues({
      'presto_shelf_progress_v1': jsonEncode({
        'byBook': {
          'book-1': {
            'sectionId': 's1',
            'pageIndex': 0,
            'finished': true,
          },
        },
      }),
    });
    final prefs = await SharedPreferences.getInstance();
    final store = ShelfProgressStore(prefs);

    // Must not throw (regression: as Map<String,dynamic>? on byBook)
    store.clearFinished('book-1');
    final progress = store.loadBook('book-1');
    expect(progress?.sectionId, 's1');
    expect(progress?.finished, isFalse);
  });

  test('saveBook then loadBook roundtrip', () async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    final store = ShelfProgressStore(prefs);
    store.saveBook('book-2', 'sec-a', pageIndex: 3, progressRatio: 0.2);
    final p = store.loadBook('book-2');
    expect(p?.sectionId, 'sec-a');
    expect(p?.pageIndex, 3);
  });
}
