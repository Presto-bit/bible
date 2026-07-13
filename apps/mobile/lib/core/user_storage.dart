/// 用户私有 SharedPreferences 按 user_code 分桶。
/// 旧版全局键由首个认领的账号接收（claim-once）。
library;

import 'package:shared_preferences/shared_preferences.dart';

const userDataLegacyClaimedKey = 'presto_user_data_legacy_claimed';
const driftLegacyClaimedKey = 'presto_drift_legacy_claimed';

/// 需 claim-once 迁入分桶的用户私有键。
const userScopedPrefBases = <String>[
  'read_chapter_events',
  'read_verse_events',
  'badge_unlock_at',
  'presto_badge_stats',
  'presto_quiz_progress',
  'presto_ai_quiz_progress',
  'presto_challenge_level_progress',
  'presto_pending_book_challenge',
  'presto_book_challenge_pushed',
  'presto_q_answer_history',
  'presto_daily_quiz_day',
  'presto_plan_sessions',
  'verse_thoughts_v1',
  'mark_note_links_v1',
  'prayer_log',
  'onboarding_name',
  'profile_bio',
  'profile_avatar',
  'account_onboarded',
  'account_has_password',
  'presto_sync_migrated_v1',
];

String prefsUserCode(SharedPreferences prefs) {
  final u = prefs.getString('presto_user_id');
  if (u != null && u.isNotEmpty) return u;
  return prefs.getString('presto_guest_id') ?? '';
}

String scopedPrefKey(String base, SharedPreferences prefs, [String? userCode]) {
  final id = (userCode ?? prefsUserCode(prefs)).trim();
  return id.isEmpty ? base : '$base:$id';
}

final _migrated = <String>{};

void migrateLegacyUserPrefsIfNeeded(SharedPreferences prefs, [String? userCode]) {
  final id = (userCode ?? prefsUserCode(prefs)).trim();
  if (id.isEmpty || _migrated.contains(id)) return;
  _migrated.add(id);

  final claimed = (prefs.getString(userDataLegacyClaimedKey) ?? '').trim();
  if (claimed.isNotEmpty && claimed != id) return;

  for (final base in userScopedPrefBases) {
    final dest = scopedPrefKey(base, prefs, id);
    if (prefs.containsKey(dest)) continue;
    if (!prefs.containsKey(base)) continue;
    final s = prefs.getString(base);
    if (s != null) {
      prefs.setString(dest, s);
      continue;
    }
    final b = prefs.getBool(base);
    if (b != null) {
      prefs.setBool(dest, b);
      continue;
    }
    final i = prefs.getInt(base);
    if (i != null) {
      prefs.setInt(dest, i);
    }
  }

  if (claimed.isEmpty) {
    prefs.setString(userDataLegacyClaimedKey, id);
  }
}

String? userPrefGetString(SharedPreferences prefs, String base, [String? userCode]) {
  migrateLegacyUserPrefsIfNeeded(prefs, userCode);
  return prefs.getString(scopedPrefKey(base, prefs, userCode));
}

Future<bool> userPrefSetString(
  SharedPreferences prefs,
  String base,
  String value, [
  String? userCode,
]) {
  migrateLegacyUserPrefsIfNeeded(prefs, userCode);
  return prefs.setString(scopedPrefKey(base, prefs, userCode), value);
}

bool? userPrefGetBool(SharedPreferences prefs, String base, [String? userCode]) {
  migrateLegacyUserPrefsIfNeeded(prefs, userCode);
  return prefs.getBool(scopedPrefKey(base, prefs, userCode));
}

Future<bool> userPrefSetBool(
  SharedPreferences prefs,
  String base,
  bool value, [
  String? userCode,
]) {
  migrateLegacyUserPrefsIfNeeded(prefs, userCode);
  return prefs.setBool(scopedPrefKey(base, prefs, userCode), value);
}

Future<bool> userPrefRemove(SharedPreferences prefs, String base, [String? userCode]) {
  migrateLegacyUserPrefsIfNeeded(prefs, userCode);
  return prefs.remove(scopedPrefKey(base, prefs, userCode));
}

String driftDbNameForUser(String userCode) {
  final id = userCode.trim();
  if (id.isEmpty) return 'presto_bible';
  return 'presto_bible_$id';
}
