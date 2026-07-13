/// 阅读进度（本地优先 + 同步）：记录“读到哪卷哪章”，供首页“继续阅读”。
library;

import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/api_client.dart' show prefsProvider;
import '../../core/database/app_database.dart';
import '../../core/sync/sync_contract.dart';
import '../notes/notes_repository.dart' show dbProvider, syncEngineProvider;
import '../../core/user_storage.dart';

final readingProgressStreamProvider =
    StreamProvider<ReadingProgressData?>((ref) => ref.watch(dbProvider).watchReadingProgress());

final readingRepoProvider = Provider<ReadingRepository>(
  (ref) => ReadingRepository(
    ref.watch(dbProvider),
    ref.watch(syncEngineProvider),
    ref.watch(prefsProvider),
  ),
);

const _chapterEventsKey = 'read_chapter_events';
const _verseEventsKey = 'read_verse_events';

class ReadingRepository {
  ReadingRepository(this._db, this._sync, this._prefs);
  final AppDatabase _db;
  final dynamic _sync;
  final SharedPreferences _prefs;

  Future<void> record(String book, int chapter, {int verse = 1}) async {
    final row = ReadingProgressData(
      singleton: 0,
      book: book,
      chapter: chapter,
      verse: verse,
      updatedAtMs: DateTime.now().millisecondsSinceEpoch,
    );
    await _db.into(_db.readingProgress).insertOnConflictUpdate(row);
    await _sync.enqueueReadingProgress(row);
    await _bumpLog(chapters: 1);
    _logChapterDetail(book.toUpperCase(), chapter);
  }

  // 章节级阅读明细（去抖 30 分钟），存 prefs，供日历回顾「常读卷/章」与读经进度。
  void _logChapterDetail(String book, int chapter) {
    final list = _readJsonList(_chapterEventsKey);
    final now = DateTime.now().millisecondsSinceEpoch;
    final recent = list.any((e) =>
        e['book'] == book &&
        e['chapter'] == chapter &&
        now - (e['ts'] as num).toInt() < 30 * 60 * 1000);
    if (recent) return;
    list.add({'ts': now, 'book': book, 'chapter': chapter});
    if (list.length > 2000) list.removeRange(0, list.length - 2000);
    userPrefSetString(_prefs, _chapterEventsKey, jsonEncode(list));
    final syncId = SyncContract.readEventSyncId(book, chapter, now);
    _sync.enqueueReadEvent(
      id: syncId,
      ts: now,
      book: book,
      chapter: chapter,
    );
  }

  // 金句记录：阅读时点选某节即记一次（去抖 10s）。
  void logVerseRead(String ref) {
    if (ref.isEmpty) return;
    final list = _readJsonList(_verseEventsKey);
    final now = DateTime.now().millisecondsSinceEpoch;
    final recent = list.any((e) =>
        e['ref'] == ref && now - (e['ts'] as num).toInt() < 10 * 1000);
    if (recent) return;
    list.add({'ts': now, 'ref': ref});
    if (list.length > 3000) list.removeRange(0, list.length - 3000);
    userPrefSetString(_prefs, _verseEventsKey, jsonEncode(list));
  }

  List<Map<String, dynamic>> _readJsonList(String key) {
    final raw = userPrefGetString(_prefs, key);
    if (raw == null || raw.isEmpty) return [];
    try {
      return (jsonDecode(raw) as List).cast<Map<String, dynamic>>();
    } catch (_) {
      return [];
    }
  }

  /// 阅读时长（前台计时累计），单位分钟。
  Future<void> addMinutes(int minutes) => _bumpLog(minutes: minutes);

  Future<void> _bumpLog({int minutes = 0, int chapters = 0}) async {
    if (minutes == 0 && chapters == 0) return;
    final date = _todayKey();
    final now = DateTime.now().millisecondsSinceEpoch;
    final prev = await _db.readingLogByDate(date);
    final row = ReadingLog(
      date: date,
      minutes: (prev?.minutes ?? 0) + minutes,
      chapters: (prev?.chapters ?? 0) + chapters,
      updatedAtMs: now,
    );
    await _db.into(_db.readingLogs).insertOnConflictUpdate(row);
    await _sync.enqueueReadingLog(row);
  }

  static String todayKey() {
    final d = DateTime.now();
    return '${d.year.toString().padLeft(4, '0')}-'
        '${d.month.toString().padLeft(2, '0')}-'
        '${d.day.toString().padLeft(2, '0')}';
  }

  static String _todayKey() => todayKey();
}

/// 阅读报告聚合（端上计算）。
class ReadingReport {
  ReadingReport({
    required this.monthMinutes,
    required this.monthDays,
    required this.monthChapters,
    required this.monthPrayers,
    required this.totalMinutes,
    required this.totalChapters,
    required this.monthly,
  });
  final int monthMinutes;
  final int monthDays;
  final int monthChapters;
  final int monthPrayers;
  final int totalMinutes;
  final int totalChapters;

  /// 最近 6 个月（yyyy-MM → minutes）。
  final List<({String label, int minutes, int chapters})> monthly;
}

final readingReportProvider = FutureProvider<ReadingReport>((ref) async {
  final db = ref.watch(dbProvider);
  final logs = await db.allReadingLogs();
  final now = DateTime.now();
  final thisMonth =
      '${now.year.toString().padLeft(4, '0')}-${now.month.toString().padLeft(2, '0')}';

  int monthMinutes = 0, monthDays = 0, monthChapters = 0;
  int totalMinutes = 0, totalChapters = 0;
  final byMonth = <String, ({int minutes, int chapters})>{};

  for (final l in logs) {
    totalMinutes += l.minutes;
    totalChapters += l.chapters;
    final ym = l.date.substring(0, 7);
    final agg = byMonth[ym] ?? (minutes: 0, chapters: 0);
    byMonth[ym] =
        (minutes: agg.minutes + l.minutes, chapters: agg.chapters + l.chapters);
    if (ym == thisMonth) {
      monthMinutes += l.minutes;
      monthChapters += l.chapters;
      if (l.minutes > 0 || l.chapters > 0) monthDays += 1;
    }
  }

  final monthly = <({String label, int minutes, int chapters})>[];
  for (var i = 5; i >= 0; i--) {
    final d = DateTime(now.year, now.month - i, 1);
    final ym =
        '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}';
    final agg = byMonth[ym] ?? (minutes: 0, chapters: 0);
    monthly.add((label: '${d.month}月', minutes: agg.minutes, chapters: agg.chapters));
  }

  // 本月祷告次数（来自 prayer_log prefs，{date:count}）。
  int monthPrayers = 0;
  final raw = userPrefGetString(ref.watch(prefsProvider), 'prayer_log');
  if (raw != null && raw.isNotEmpty) {
    try {
      final log = jsonDecode(raw) as Map<String, dynamic>;
      for (final e in log.entries) {
        if (e.key.startsWith(thisMonth)) {
          monthPrayers += ((e.value ?? 0) as num).toInt();
        }
      }
    } catch (_) {}
  }

  return ReadingReport(
    monthMinutes: monthMinutes,
    monthDays: monthDays,
    monthChapters: monthChapters,
    monthPrayers: monthPrayers,
    totalMinutes: totalMinutes,
    totalChapters: totalChapters,
    monthly: monthly,
  );
});

final todayReadingProvider = FutureProvider<int>((ref) async {
  final db = ref.watch(dbProvider);
  final log = await db.readingLogByDate(ReadingRepository.todayKey());
  return log?.minutes ?? 0;
});

// ── 日历回顾 / 读经进度：聚合数据 ──

class RankItem {
  RankItem(this.key, this.count);
  final String key;
  final int count;
}

class RangeStats {
  RangeStats({
    required this.minutes,
    required this.days,
    required this.chapters,
    required this.topBooks,
    required this.topChapters,
    required this.topVerses,
  });
  final int minutes;
  final int days;
  final int chapters;
  final List<RankItem> topBooks; // key = book id
  final List<RankItem> topChapters; // key = book.chapter
  final List<RankItem> topVerses; // key = book.chapter.verse
}

class BookProgress {
  BookProgress(this.passes, this.remainderPct, this.distinctChapters);
  final int passes;
  final int remainderPct;
  final int distinctChapters;
}

class ReviewData {
  ReviewData({
    required this.minutesByDay,
    required this.chaptersByDay,
    required this.chapterEvents,
    required this.verseEvents,
  });
  final Map<String, int> minutesByDay; // 'yyyy-MM-dd' -> minutes
  final Map<String, int> chaptersByDay;
  final List<Map<String, dynamic>> chapterEvents; // {ts, book, chapter}
  final List<Map<String, dynamic>> verseEvents; // {ts, ref}

  int minutesIn(int startMs, int endMs) {
    var total = 0;
    minutesByDay.forEach((date, mins) {
      final t = DateTime.tryParse('${date}T00:00:00')?.millisecondsSinceEpoch;
      if (t != null && t >= startMs && t < endMs) total += mins;
    });
    return total;
  }

  RangeStats rangeStats(int startMs, int endMs) {
    var minutes = 0, chapters = 0, days = 0;
    minutesByDay.forEach((date, mins) {
      final t = DateTime.tryParse('${date}T00:00:00')?.millisecondsSinceEpoch;
      if (t != null && t >= startMs && t < endMs) {
        minutes += mins;
        final ch = chaptersByDay[date] ?? 0;
        chapters += ch;
        if (mins > 0 || ch > 0) days += 1;
      }
    });
    final bookCount = <String, int>{};
    final chapCount = <String, int>{};
    for (final e in chapterEvents) {
      final ts = (e['ts'] as num).toInt();
      if (ts >= startMs && ts < endMs) {
        final b = e['book'] as String;
        bookCount[b] = (bookCount[b] ?? 0) + 1;
        final ck = '$b.${e['chapter']}';
        chapCount[ck] = (chapCount[ck] ?? 0) + 1;
      }
    }
    final verseCount = <String, int>{};
    for (final e in verseEvents) {
      final ts = (e['ts'] as num).toInt();
      if (ts >= startMs && ts < endMs) {
        final r = e['ref'] as String;
        verseCount[r] = (verseCount[r] ?? 0) + 1;
      }
    }
    List<RankItem> rank(Map<String, int> m, int n) {
      final list = m.entries.map((e) => RankItem(e.key, e.value)).toList()
        ..sort((a, b) => b.count.compareTo(a.count));
      return list.take(n).toList();
    }

    return RangeStats(
      minutes: minutes,
      days: days,
      chapters: chapters,
      topBooks: rank(bookCount, 5),
      topChapters: rank(chapCount, 5),
      topVerses: rank(verseCount, 3),
    );
  }

  /// 某卷最近一次读到的章（供「读经进度」跳到最新进度而非开头）。
  int? lastChapterOf(String book) {
    Map<String, dynamic>? best;
    for (final e in chapterEvents) {
      if (e['book'] != book) continue;
      if (best == null || (e['ts'] as num).toInt() > (best['ts'] as num).toInt()) {
        best = e;
      }
    }
    return best == null ? null : (best['chapter'] as num).toInt();
  }

  /// 最早活动年份（无记录时返回当年）；用作「注册年」近似。
  int firstYear() {
    int? minTs;
    for (final e in chapterEvents) {
      final ts = (e['ts'] as num).toInt();
      if (minTs == null || ts < minTs) minTs = ts;
    }
    if (minTs == null) return DateTime.now().year;
    return DateTime.fromMillisecondsSinceEpoch(minTs).year;
  }

  Map<String, BookProgress> bookProgress(
    Map<String, int> totals, {
    int? startMs,
    int? endMs,
  }) {
    final reads = <String, int>{};
    final distinct = <String, Set<int>>{};
    for (final e in chapterEvents) {
      final ts = (e['ts'] as num).toInt();
      if (startMs != null && (ts < startMs || ts >= endMs!)) continue;
      final b = e['book'] as String;
      reads[b] = (reads[b] ?? 0) + 1;
      (distinct[b] ??= <int>{}).add((e['chapter'] as num).toInt());
    }
    final out = <String, BookProgress>{};
    totals.forEach((book, total) {
      final r = reads[book] ?? 0;
      if (r == 0 || total <= 0) {
        out[book] = BookProgress(0, 0, 0);
        return;
      }
      final passes = r ~/ total;
      final remainderPct = ((r % total) / total * 100).round();
      out[book] = BookProgress(passes, remainderPct, distinct[book]?.length ?? 0);
    });
    return out;
  }
}

final reviewDataProvider = FutureProvider<ReviewData>((ref) async {
  final db = ref.watch(dbProvider);
  final logs = await db.allReadingLogs();
  final minutes = <String, int>{};
  final chapters = <String, int>{};
  for (final l in logs) {
    minutes[l.date] = l.minutes;
    chapters[l.date] = l.chapters;
  }
  final prefs = ref.watch(prefsProvider);
  List<Map<String, dynamic>> rd(String k) {
    final raw = userPrefGetString(prefs, k);
    if (raw == null || raw.isEmpty) return [];
    try {
      return (jsonDecode(raw) as List).cast<Map<String, dynamic>>();
    } catch (_) {
      return [];
    }
  }

  return ReviewData(
    minutesByDay: minutes,
    chaptersByDay: chapters,
    chapterEvents: rd(_chapterEventsKey),
    verseEvents: rd(_verseEventsKey),
  );
});
