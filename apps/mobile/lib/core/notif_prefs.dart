/// 读经提醒 / 读经勿扰 — 键名与默认值对齐 PRODUCT §2.6.1 / Web notif_prefs。
///
/// - 每日读经提醒：默认 **关**
/// - 读经勿扰：默认 **开**（圣经 Tab 不弹社交提示）
library;

import 'package:shared_preferences/shared_preferences.dart';

class NotifPrefs {
  NotifPrefs._();

  static const dailyEnabledKey = 'reminder_daily_enabled';
  static const dailyHourKey = 'reminder_daily_hour';
  static const dailyMinuteKey = 'reminder_daily_minute';
  static const readingDndKey = 'reading_dnd';

  static bool dailyEnabled(SharedPreferences p) =>
      p.getBool(dailyEnabledKey) ?? false;

  static int dailyHour(SharedPreferences p) => p.getInt(dailyHourKey) ?? 7;

  static int dailyMinute(SharedPreferences p) =>
      p.getInt(dailyMinuteKey) ?? 30;

  /// 读经勿扰：默认 true
  static bool readingDnd(SharedPreferences p) =>
      p.getBool(readingDndKey) ?? true;

  static Future<void> setDailyEnabled(SharedPreferences p, bool v) =>
      p.setBool(dailyEnabledKey, v);

  static Future<void> setDailyTime(
    SharedPreferences p, {
    required int hour,
    required int minute,
  }) async {
    await p.setInt(dailyHourKey, hour);
    await p.setInt(dailyMinuteKey, minute);
  }

  static Future<void> setReadingDnd(SharedPreferences p, bool v) =>
      p.setBool(readingDndKey, v);
}
