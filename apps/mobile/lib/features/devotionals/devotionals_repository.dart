/// 创世记 50 次同行：内容拉取、进度与打卡。
library;

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/api_client.dart';

const genesis50SeriesId = 'genesis_50_walk';
const genesis50DefaultDay = 7;

final devotionalsRepositoryProvider = Provider<DevotionalsRepository>((ref) {
  return DevotionalsRepository(ref.watch(dioProvider), ref.watch(prefsProvider));
});

class DevotionalHomeCard {
  DevotionalHomeCard({
    required this.seriesId,
    required this.title,
    required this.day,
    required this.daysTotal,
    required this.defaultDay,
    required this.scheduledDay,
    required this.participantsCount,
    required this.myDays,
    required this.hasOpened,
    required this.href,
    this.dayTitle,
    this.subtitle,
    this.lastTab,
  });
  final String seriesId;
  final String title;
  final String? subtitle;
  final int day;
  final int daysTotal;
  final int defaultDay;
  final int scheduledDay;
  final int participantsCount;
  final int myDays;
  final bool hasOpened;
  final String href;
  final String? dayTitle;
  final String? lastTab;

  factory DevotionalHomeCard.fromJson(Map<String, dynamic> j) => DevotionalHomeCard(
        seriesId: (j['series_id'] ?? genesis50SeriesId) as String,
        title: (j['title'] ?? '') as String,
        subtitle: j['subtitle'] as String?,
        day: (j['day'] ?? genesis50DefaultDay) as int,
        daysTotal: (j['days_total'] ?? 50) as int,
        defaultDay: (j['default_day'] ?? genesis50DefaultDay) as int,
        scheduledDay: (j['scheduled_day'] ?? j['day'] ?? genesis50DefaultDay) as int,
        participantsCount: (j['participants_count'] ?? 0) as int,
        myDays: (j['my_days'] ?? 0) as int,
        hasOpened: (j['has_opened'] ?? false) as bool,
        href: (j['href'] ?? '/devotionals/$genesis50SeriesId') as String,
        dayTitle: j['day_title'] as String?,
        lastTab: j['last_tab'] as String?,
      );

  bool get isCompleted => myDays >= daysTotal && daysTotal > 0;
}

String tabLabel(String? tab) {
  switch (tab) {
    case 'letter':
      return '灵修书信';
    case 'workbook':
      return '默想教材';
    default:
      return '经文';
  }
}

class DevotionalDayDetail {
  DevotionalDayDetail({
    required this.seriesId,
    required this.day,
    required this.title,
    required this.book,
    required this.bookName,
    required this.chapter,
    required this.letterBody,
    required this.letterPrayer,
    required this.workbook,
    required this.verses,
    required this.participantsCount,
    required this.myDays,
    required this.checkedDays,
    required this.dayCheckins,
    required this.sessions,
    this.focusVerses,
    this.myCheckinEmoji,
    this.myCheckinBody,
    this.seriesTitle,
    this.todayCheckins = 0,
    this.daysTotal = 50,
  });

  final String seriesId;
  final String? seriesTitle;
  final int day;
  final String title;
  final String book;
  final String bookName;
  final int chapter;
  final String? focusVerses;
  final String letterBody;
  final String letterPrayer;
  final Map<String, dynamic> workbook;
  final List<Map<String, dynamic>> verses;
  final int participantsCount;
  final int myDays;
  final List<int> checkedDays;
  final int dayCheckins;
  final int todayCheckins;
  final int daysTotal;
  final List<Map<String, dynamic>> sessions;
  final String? myCheckinEmoji;
  final String? myCheckinBody;

  factory DevotionalDayDetail.fromJson(Map<String, dynamic> j) {
    final letter = (j['letter'] as Map?)?.cast<String, dynamic>() ?? const {};
    final scripture = (j['scripture'] as Map?)?.cast<String, dynamic>() ?? const {};
    final verses = ((scripture['verses'] as List?) ?? const [])
        .whereType<Map>()
        .map((e) => e.cast<String, dynamic>())
        .toList();
    final sessions = ((j['sessions'] as List?) ?? const [])
        .whereType<Map>()
        .map((e) => e.cast<String, dynamic>())
        .toList();
    final checked = ((j['checked_days'] as List?) ?? const [])
        .map((e) => int.tryParse('$e') ?? 0)
        .where((e) => e > 0)
        .toList();
    final mine = (j['my_checkin'] as Map?)?.cast<String, dynamic>();
    return DevotionalDayDetail(
      seriesId: (j['series_id'] ?? genesis50SeriesId) as String,
      seriesTitle: j['series_title'] as String?,
      day: (j['day'] ?? 1) as int,
      title: (j['title'] ?? '') as String,
      book: (j['book'] ?? 'GEN') as String,
      bookName: (j['book_name'] ?? '创世记') as String,
      chapter: (j['chapter'] ?? 1) as int,
      focusVerses: j['focus_verses'] as String?,
      letterBody: (letter['body'] ?? '') as String,
      letterPrayer: (letter['prayer'] ?? '') as String,
      workbook: (j['workbook'] as Map?)?.cast<String, dynamic>() ?? const {},
      verses: verses,
      participantsCount: (j['participants_count'] ?? 0) as int,
      myDays: (j['my_days'] ?? 0) as int,
      checkedDays: checked,
      dayCheckins: (j['day_checkins'] ?? 0) as int,
      todayCheckins: (j['today_checkins'] ?? 0) as int,
      daysTotal: (j['days_total'] ?? 50) as int,
      sessions: sessions,
      myCheckinEmoji: mine?['emoji'] as String?,
      myCheckinBody: mine?['body'] as String?,
    );
  }
}

class DevotionalsRepository {
  DevotionalsRepository(this._dio, this._prefs);
  final Dio _dio;
  final SharedPreferences _prefs;

  String _progressKey(String seriesId) => 'devotional:$seriesId:day';

  int localDay(String seriesId) =>
      _prefs.getInt(_progressKey(seriesId)) ?? genesis50DefaultDay;

  Future<void> saveLocalDay(String seriesId, int day) async {
    await _prefs.setInt(_progressKey(seriesId), day);
  }

  Future<bool> isAdminEligible() async {
    try {
      final res = await _dio.get('/admin/auth/eligible');
      return (res.data as Map)['admin_eligible'] == true;
    } catch (_) {
      return false;
    }
  }

  Future<DevotionalHomeCard> homeCard({String seriesId = genesis50SeriesId}) async {
    final res = await _dio.get('/content/devotionals/$seriesId/home-card');
    return DevotionalHomeCard.fromJson((res.data as Map).cast<String, dynamic>());
  }

  Future<DevotionalDayDetail> dayDetail(String seriesId, int day) async {
    final res = await _dio.get('/content/devotionals/$seriesId/day/$day');
    return DevotionalDayDetail.fromJson((res.data as Map).cast<String, dynamic>());
  }

  Future<void> saveProgress(String seriesId, int day, {String tab = 'scripture'}) async {
    await saveLocalDay(seriesId, day);
    await _dio.post('/content/devotionals/$seriesId/progress', data: {
      'day': day,
      'tab': tab,
    });
  }

  Future<void> checkin(String seriesId, int day, {required String emoji, String? body}) async {
    await _dio.post('/content/devotionals/$seriesId/day/$day/checkin', data: {
      'emoji': emoji,
      'body': body,
    });
  }

  Future<List<Map<String, dynamic>>> feed(String seriesId, int day) async {
    final res = await _dio.get('/content/devotionals/$seriesId/day/$day/feed');
    final items = (res.data as Map)['items'] as List? ?? const [];
    return items.whereType<Map>().map((e) => e.cast<String, dynamic>()).toList();
  }
}

/// 仅管理员可见：非管理员返回 null。
final genesis50HomeCardProvider = FutureProvider<DevotionalHomeCard?>((ref) async {
  final repo = ref.watch(devotionalsRepositoryProvider);
  final admin = await repo.isAdminEligible();
  if (!admin) return null;
  try {
    return await repo.homeCard();
  } catch (_) {
    return null;
  }
});
