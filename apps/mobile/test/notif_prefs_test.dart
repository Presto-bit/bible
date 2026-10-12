import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:presto_bible/core/notif_prefs.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('提醒默认关、勿扰默认开', () async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    expect(NotifPrefs.dailyEnabled(prefs), isFalse);
    expect(NotifPrefs.readingDnd(prefs), isTrue);
  });
}
