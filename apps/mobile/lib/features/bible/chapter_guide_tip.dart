/// 章导读轻提示规则（对齐 Web `chapter_guide_tip.ts`）。
library;

import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

const chapterGuideDwellMs = 8000;
const chapterGuideDailyMax = 3;
const chapterGuideSessionMax = 1;

const _seenKey = 'chapter_guide_seen_v1';
const _dayKey = 'chapter_guide_day_v1';
const _bookDayKey = 'chapter_guide_book_day_v1';
const _disabledKey = 'chapter_guide_disabled_v1';

/// 进程内会话状态（对齐 sessionStorage）。
final Map<String, int> _sessionSkip = {};
var _sessionShown = 0;

String _todayKey() {
  final d = DateTime.now();
  return '${d.year}-${d.month}-${d.day}';
}

String _chapterKey(String bookId, int chapter) =>
    '${bookId.toUpperCase()}.$chapter';

String _bookKey(String bookId) => bookId.toUpperCase();

Map<String, int> _readSeen(SharedPreferences prefs) {
  try {
    final raw = prefs.getString(_seenKey);
    if (raw == null) return {};
    return (jsonDecode(raw) as Map).map((k, v) => MapEntry('$k', 1));
  } catch (_) {
    return {};
  }
}

Future<void> _writeSeen(SharedPreferences prefs, Map<String, int> map) async {
  await prefs.setString(_seenKey, jsonEncode(map));
}

({String day, int count}) _readDay(SharedPreferences prefs) {
  final day = _todayKey();
  try {
    final raw = prefs.getString(_dayKey);
    if (raw == null) return (day: day, count: 0);
    final j = jsonDecode(raw) as Map<String, dynamic>;
    if (j['day'] != day) return (day: day, count: 0);
    return (day: day, count: (j['count'] as num?)?.toInt() ?? 0);
  } catch (_) {
    return (day: day, count: 0);
  }
}

Future<void> _writeDay(SharedPreferences prefs, ({String day, int count}) s) =>
    prefs.setString(_dayKey, jsonEncode({'day': s.day, 'count': s.count}));

Map<String, int> _readBookDayBooks(SharedPreferences prefs) {
  final day = _todayKey();
  try {
    final raw = prefs.getString(_bookDayKey);
    if (raw == null) return {};
    final j = jsonDecode(raw) as Map<String, dynamic>;
    if (j['day'] != day) return {};
    final books = j['books'];
    if (books is! Map) return {};
    return books.map((k, v) => MapEntry('$k', 1));
  } catch (_) {
    return {};
  }
}

Future<void> _writeBookDay(
  SharedPreferences prefs,
  Map<String, int> books,
) =>
    prefs.setString(
      _bookDayKey,
      jsonEncode({'day': _todayKey(), 'books': books}),
    );

bool isChapterGuideAutoDisabled(SharedPreferences prefs) =>
    prefs.getBool(_disabledKey) == true ||
    prefs.getString(_disabledKey) == '1';

Future<void> disableChapterGuideAuto(SharedPreferences prefs) =>
    prefs.setBool(_disabledKey, true);

bool hasSeenChapterGuide(
  SharedPreferences prefs,
  String bookId,
  int chapter,
) =>
    _readSeen(prefs).containsKey(_chapterKey(bookId, chapter));

Future<void> markChapterGuideSeen(
  SharedPreferences prefs,
  String bookId,
  int chapter,
) async {
  final map = _readSeen(prefs);
  map[_chapterKey(bookId, chapter)] = 1;
  await _writeSeen(prefs, map);
}

bool hasBookGuideTippedToday(SharedPreferences prefs, String bookId) =>
    _readBookDayBooks(prefs).containsKey(_bookKey(bookId));

Future<void> markBookGuideTippedToday(
  SharedPreferences prefs,
  String bookId,
) async {
  final books = _readBookDayBooks(prefs);
  books[_bookKey(bookId)] = 1;
  await _writeBookDay(prefs, books);
}

void skipChapterGuideThisSession(String bookId, int chapter) {
  _sessionSkip[_chapterKey(bookId, chapter)] = 1;
}

bool isChapterGuideSkippedThisSession(String bookId, int chapter) =>
    _sessionSkip.containsKey(_chapterKey(bookId, chapter));

enum ChapterGuideNavKind { swipe, adjacent, jump }

enum ChapterGuideIntent { jump, dwell }

ChapterGuideNavKind resolveChapterGuideNavKind({
  required bool fromSwipe,
  String? prevBookId,
  int? prevChapter,
  required String bookId,
  required int chapter,
}) {
  if (fromSwipe) return ChapterGuideNavKind.swipe;
  if (prevBookId == null || prevChapter == null) return ChapterGuideNavKind.jump;
  if (prevBookId.toUpperCase() != bookId.toUpperCase()) {
    return ChapterGuideNavKind.jump;
  }
  if ((chapter - prevChapter).abs() != 1) return ChapterGuideNavKind.jump;
  return ChapterGuideNavKind.adjacent;
}

bool _passesCommonGates(
  SharedPreferences prefs,
  String bookId,
  int chapter, {
  bool hasCachedSummary = true,
  bool isOnline = true,
}) {
  if (isChapterGuideAutoDisabled(prefs)) return false;
  if (bookId.isEmpty || chapter < 1) return false;
  if (isChapterGuideSkippedThisSession(bookId, chapter)) return false;
  if (_sessionShown >= chapterGuideSessionMax) return false;
  if (_readDay(prefs).count >= chapterGuideDailyMax) return false;
  if (!isOnline && !hasCachedSummary) return false;
  return true;
}

bool shouldShowChapterGuideTip({
  required SharedPreferences prefs,
  required String bookId,
  required int chapter,
  required ChapterGuideIntent intent,
  bool hasCachedSummary = true,
  bool isOnline = true,
}) {
  if (!_passesCommonGates(
    prefs,
    bookId,
    chapter,
    hasCachedSummary: hasCachedSummary,
    isOnline: isOnline,
  )) {
    return false;
  }
  if (intent == ChapterGuideIntent.jump) {
    return !hasBookGuideTippedToday(prefs, bookId);
  }
  if (hasSeenChapterGuide(prefs, bookId, chapter)) return false;
  return true;
}

Future<void> recordChapterGuideTipShown(
  SharedPreferences prefs,
  String bookId,
  int chapter,
) async {
  await markChapterGuideSeen(prefs, bookId, chapter);
  await markBookGuideTippedToday(prefs, bookId);
  final day = _readDay(prefs);
  await _writeDay(prefs, (day: day.day, count: day.count + 1));
  _sessionShown += 1;
}
