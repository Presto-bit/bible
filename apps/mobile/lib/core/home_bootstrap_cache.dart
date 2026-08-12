/// 首页 bootstrap TTL 与经文缓存（对齐 Web `home_refresh` / `daily_verse_cache`）。
library;

import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

/// 与 Web `HOME_BOOTSTRAP_TTL_MS` 一致：5 分钟。
const homeBootstrapTtlMs = 5 * 60 * 1000;

const _kBootstrapAt = 'home_bootstrap_fetched_at_ms';
const _kBootstrapJson = 'home_bootstrap_json_v1';
const _kBootstrapDay = 'home_bootstrap_day_ymd';

bool shouldFetchHomeNetwork({
  required int lastAtMs,
  required int ttlMs,
  bool force = false,
}) {
  if (force) return true;
  if (lastAtMs <= 0) return true;
  return DateTime.now().millisecondsSinceEpoch - lastAtMs >= ttlMs;
}

class HomeBootstrapCache {
  HomeBootstrapCache(this._prefs);
  final SharedPreferences _prefs;

  int get lastFetchedAtMs => _prefs.getInt(_kBootstrapAt) ?? 0;

  String? get cachedDayYmd => _prefs.getString(_kBootstrapDay);

  Map<String, dynamic>? readJson({required String todayYmd}) {
    final day = _prefs.getString(_kBootstrapDay);
    if (day != todayYmd) return null;
    final raw = _prefs.getString(_kBootstrapJson);
    if (raw == null || raw.isEmpty) return null;
    try {
      final decoded = jsonDecode(raw);
      if (decoded is Map<String, dynamic>) return decoded;
      if (decoded is Map) return Map<String, dynamic>.from(decoded);
    } catch (_) {}
    return null;
  }

  Future<void> writeJson(Map<String, dynamic> json, {required String todayYmd}) async {
    await _prefs.setString(_kBootstrapJson, jsonEncode(json));
    await _prefs.setString(_kBootstrapDay, todayYmd);
    await _prefs.setInt(
        _kBootstrapAt, DateTime.now().millisecondsSinceEpoch);
  }

  Future<void> markFetchedNow() async {
    await _prefs.setInt(
        _kBootstrapAt, DateTime.now().millisecondsSinceEpoch);
  }
}
