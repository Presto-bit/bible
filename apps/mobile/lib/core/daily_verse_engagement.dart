/// 每日经文点赞本地缓存（与 Web `daily_verse_engagement.ts` 对齐）。
library;

import 'package:shared_preferences/shared_preferences.dart';

import 'session.dart';

String _likeKey(int verseDay, String userCode) =>
    'presto_dv_like_${verseDay}_$userCode';

bool? readLocalDailyVerseLike(SharedPreferences prefs, Session session, int verseDay) {
  final code = session.effectiveUserCode;
  if (code.isEmpty || verseDay < 1) return null;
  final raw = prefs.getString(_likeKey(verseDay, code));
  if (raw == '1') return true;
  if (raw == '0') return false;
  return null;
}

Future<void> writeLocalDailyVerseLike(
  SharedPreferences prefs,
  Session session,
  int verseDay,
  bool liked,
) async {
  final code = session.effectiveUserCode;
  if (code.isEmpty || verseDay < 1) return;
  await prefs.setString(_likeKey(verseDay, code), liked ? '1' : '0');
}
