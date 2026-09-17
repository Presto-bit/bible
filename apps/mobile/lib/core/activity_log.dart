/// 非读经类活动日计数（祷告/听读/书架/示意卡/知识库）。
library;

import 'dart:async';
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../features/notes/notes_repository.dart' show syncEngineProvider;
import 'product_events.dart';
import 'user_storage.dart';

const _key = 'presto_activity_log';

class ActivityDay {
  ActivityDay({
    this.prayers = 0,
    this.listenMinutes = 0,
    this.shelfCheckins = 0,
    this.shelfPosts = 0,
    this.visualCards = 0,
    this.knowledgeSteps = 0,
  });

  final int prayers;
  final int listenMinutes;
  final int shelfCheckins;
  final int shelfPosts;
  final int visualCards;
  final int knowledgeSteps;

  ActivityDay copyWith({
    int? prayers,
    int? listenMinutes,
    int? shelfCheckins,
    int? shelfPosts,
    int? visualCards,
    int? knowledgeSteps,
  }) {
    return ActivityDay(
      prayers: prayers ?? this.prayers,
      listenMinutes: listenMinutes ?? this.listenMinutes,
      shelfCheckins: shelfCheckins ?? this.shelfCheckins,
      shelfPosts: shelfPosts ?? this.shelfPosts,
      visualCards: visualCards ?? this.visualCards,
      knowledgeSteps: knowledgeSteps ?? this.knowledgeSteps,
    );
  }
}

String _ymd(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

Map<String, ActivityDay> _readAll(SharedPreferences prefs) {
  final raw = userPrefGetString(prefs, _key);
  if (raw == null || raw.isEmpty) return {};
  try {
    final j = jsonDecode(raw) as Map<String, dynamic>;
    return j.map((day, v) {
      final m = v as Map<String, dynamic>;
      return MapEntry(
        day,
        ActivityDay(
          prayers: (m['prayers'] as num?)?.toInt() ?? 0,
          listenMinutes: (m['listen_minutes'] as num?)?.toInt() ?? 0,
          shelfCheckins: (m['shelf_checkins'] as num?)?.toInt() ?? 0,
          shelfPosts: (m['shelf_posts'] as num?)?.toInt() ?? 0,
          visualCards: (m['visual_cards'] as num?)?.toInt() ?? 0,
          knowledgeSteps: (m['knowledge_steps'] as num?)?.toInt() ?? 0,
        ),
      );
    });
  } catch (_) {
    return {};
  }
}

void _writeAll(
  SharedPreferences prefs,
  Map<String, ActivityDay> all, {
  Ref? ref,
  String? pushDay,
}) {
  final out = all.map(
    (day, v) => MapEntry(day, {
      'prayers': v.prayers,
      'listen_minutes': v.listenMinutes,
      'shelf_checkins': v.shelfCheckins,
      'shelf_posts': v.shelfPosts,
      'visual_cards': v.visualCards,
      'knowledge_steps': v.knowledgeSteps,
    }),
  );
  userPrefSetString(prefs, _key, jsonEncode(out));
  if (ref != null && pushDay != null) {
    final row = all[pushDay];
    if (row != null) {
      unawaited(
        ref.read(syncEngineProvider).enqueueActivityLog(
              date: pushDay,
              prayers: row.prayers,
              listenMinutes: row.listenMinutes,
              shelfCheckins: row.shelfCheckins,
              shelfPosts: row.shelfPosts,
              visualCards: row.visualCards,
              knowledgeSteps: row.knowledgeSteps,
            ),
      );
    }
  }
}

void _bump(
  SharedPreferences prefs,
  Ref ref,
  ActivityDay Function(ActivityDay cur) fn,
) {
  final day = _ymd(DateTime.now());
  final all = _readAll(prefs);
  final cur = all[day] ?? ActivityDay();
  all[day] = fn(cur);
  _writeAll(prefs, all, ref: ref, pushDay: day);
}

void _bumpPrayerLog(SharedPreferences prefs) {
  const prayerKey = 'prayer_log';
  final day = _ymd(DateTime.now());
  Map<String, dynamic> logs = {};
  final raw = userPrefGetString(prefs, prayerKey);
  if (raw != null && raw.isNotEmpty) {
    try {
      logs = jsonDecode(raw) as Map<String, dynamic>;
    } catch (_) {}
  }
  logs[day] = ((logs[day] ?? 0) as num).toInt() + 1;
  userPrefSetString(prefs, prayerKey, jsonEncode(logs));
}

Future<void> logActivityPrayer(
  Ref ref, {
  String? flowId,
  String? planId,
}) async {
  final prefs = ref.read(prefsProvider);
  _bumpPrayerLog(prefs);
  _bump(prefs, ref, (c) => c.copyWith(prayers: c.prayers + 1));
  await trackProductEvent(
    ref,
    'prayer_finish',
    props: {
      if (flowId != null) 'flow_id': flowId,
      if (planId != null) 'plan_id': planId,
    },
  );
}

ActivityDay activityTotalsInRange(
  SharedPreferences prefs,
  int startMs,
  int endMs,
) {
  var out = ActivityDay();
  for (final e in _readAll(prefs).entries) {
    final t = DateTime.tryParse('${e.key}T00:00:00')?.millisecondsSinceEpoch;
    if (t == null || t < startMs || t >= endMs) continue;
    final row = e.value;
    out = out.copyWith(
      prayers: out.prayers + row.prayers,
      listenMinutes: out.listenMinutes + row.listenMinutes,
      shelfCheckins: out.shelfCheckins + row.shelfCheckins,
      shelfPosts: out.shelfPosts + row.shelfPosts,
      visualCards: out.visualCards + row.visualCards,
      knowledgeSteps: out.knowledgeSteps + row.knowledgeSteps,
    );
  }
  return out;
}

sealed class ReportFourthTile {}

class ReportFourthMetric extends ReportFourthTile {
  ReportFourthMetric(this.value, this.unit, this.label);
  final int value;
  final String unit;
  final String label;
}

class ReportFourthCta extends ReportFourthTile {
  ReportFourthCta(this.title, this.sub, this.href);
  final String title;
  final String sub;
  final String href;
}

ReportFourthTile pickReportFourthTile({
  required int prayers,
  required int listenMinutes,
  required int shelfCheckins,
  required int visualCards,
  required int knowledgeSteps,
}) {
  if (listenMinutes > 0) {
    return ReportFourthMetric(listenMinutes, '分钟', '听读');
  }
  if (prayers > 0) {
    return ReportFourthMetric(prayers, '次', '祷告打卡');
  }
  if (shelfCheckins > 0) {
    return ReportFourthMetric(shelfCheckins, '次', '书架打卡');
  }
  if (visualCards > 0) {
    return ReportFourthMetric(visualCards, '张', '示意卡');
  }
  if (knowledgeSteps > 0) {
    return ReportFourthMetric(knowledgeSteps, '步', '知识导览');
  }
  return ReportFourthCta('去祷告', '开始第一次', '/pray');
}

Future<void> logListenOpen(Ref ref, String book, int chapter) {
  return trackProductEvent(
    ref,
    'listen_open',
    props: {'book': book, 'chapter': chapter},
    oncePerDay: true,
    onceSalt: 'listen_open:$book:$chapter',
  );
}

Future<void> logListenSessionEnd(
  Ref ref, {
  required String book,
  required int chapter,
  required int minutes,
  required bool completed,
  required Future<void> Function(int minutes) bumpReadingMinutes,
}) async {
  final mins = minutes < 1 ? 0 : minutes;
  if (mins > 0) {
    final prefs = ref.read(prefsProvider);
    _bump(
      prefs,
      ref,
      (c) => c.copyWith(listenMinutes: c.listenMinutes + mins),
    );
    await bumpReadingMinutes(mins);
  }
  await trackProductEvent(
    ref,
    'listen_session_end',
    props: {
      'book': book,
      'chapter': chapter,
      'minutes': mins,
      'completed': completed,
      'source': 'listen',
    },
  );
}

Future<void> logShelfCheckin(Ref ref, String bookId, {String? sectionId}) async {
  final prefs = ref.read(prefsProvider);
  _bump(prefs, ref, (c) => c.copyWith(shelfCheckins: c.shelfCheckins + 1));
  await trackProductEvent(
    ref,
    'shelf_checkin',
    props: {
      'book_id': bookId,
      if (sectionId != null) 'section_id': sectionId,
    },
  );
}

Future<void> logShelfOpen(Ref ref, String bookId, bool hasProgress) {
  return trackProductEvent(
    ref,
    'shelf_open',
    props: {'book_id': bookId, 'has_progress': hasProgress},
    oncePerDay: true,
    onceSalt: 'shelf_open:$bookId',
  );
}

Future<void> logShelfPost(Ref ref, String bookId, String kind) async {
  final prefs = ref.read(prefsProvider);
  _bump(prefs, ref, (c) => c.copyWith(shelfPosts: c.shelfPosts + 1));
  await trackProductEvent(
    ref,
    'shelf_post',
    props: {'book_id': bookId, 'kind': kind},
  );
}

Future<void> logVisualCardView(Ref ref, String cardId, {String mode = 'link'}) async {
  final prefs = ref.read(prefsProvider);
  _bump(prefs, ref, (c) => c.copyWith(visualCards: c.visualCards + 1));
  await trackProductEvent(
    ref,
    'visual_card_view',
    props: {'card_id': cardId, 'mode': mode},
    oncePerDay: true,
    onceSalt: 'visual_card:$cardId:$mode',
  );
}
