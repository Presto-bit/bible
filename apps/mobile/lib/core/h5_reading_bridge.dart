/// 把 Flutter 本地读经数据写入 H5 localStorage，供故事回顾 / 报告页读取。
library;

import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../features/notes/notes_repository.dart' show dbProvider;
import 'api_client.dart';
import 'user_storage.dart';

const _chapterEventsKey = 'read_chapter_events';
const _verseEventsKey = 'read_verse_events';

Future<String> buildH5ReadingHydrateJs(WidgetRef ref) async {
  final session = ref.read(sessionProvider);
  final prefs = ref.read(prefsProvider);
  final db = ref.read(dbProvider);
  final userCode = session.effectiveUserCode.trim();
  final signedIn = session.isSignedIn;

  Map<String, Map<String, int>> logs = {};
  try {
    final rows = await db.allReadingLogs();
    for (final row in rows) {
      logs[row.date] = {'minutes': row.minutes, 'chapters': row.chapters};
    }
  } catch (_) {}

  List<dynamic> events = const [];
  List<dynamic> verses = const [];
  try {
    events = _readJsonList(prefs, _chapterEventsKey);
    verses = _readJsonList(prefs, _verseEventsKey);
  } catch (_) {}

  Map<String, dynamic>? lastRead;
  try {
    final progress = await db.currentReadingProgress();
    if (progress != null && progress.book.trim().isNotEmpty) {
      lastRead = {'bookId': progress.book, 'chapter': progress.chapter};
    }
  } catch (_) {}

  final payload = {
    'userCode': userCode,
    'signedIn': signedIn,
    'logs': logs,
    'events': events,
    'verses': verses,
    'lastRead': lastRead,
  };
  return '''
(function(){
  try {
    var d = ${jsonEncode(payload)};
    var code = (d.userCode || '').trim();
    if (code) {
      try {
        if (d.signedIn) localStorage.setItem('presto_user_id', code);
        else localStorage.setItem('presto_guest_id', code);
      } catch (e) {}
    }
    function writeBoth(base, value) {
      var s = JSON.stringify(value);
      localStorage.setItem(base, s);
      if (code) localStorage.setItem(base + ':' + code, s);
    }
    function mergeLog(incoming) {
      var cur = {};
      try { cur = JSON.parse(localStorage.getItem(code ? ('presto_reading_log:' + code) : 'presto_reading_log') || '{}') || {}; } catch (e) {}
      Object.keys(incoming || {}).forEach(function(day) {
        var a = cur[day] || {};
        var b = incoming[day] || {};
        cur[day] = {
          minutes: Math.max(a.minutes || 0, b.minutes || 0),
          chapters: Math.max(a.chapters || 0, b.chapters || 0)
        };
      });
      return cur;
    }
    function mergeList(base, incoming, idFn) {
      var cur = [];
      try { cur = JSON.parse(localStorage.getItem(code ? (base + ':' + code) : base) || '[]') || []; } catch (e) {}
      if (!Array.isArray(cur)) cur = [];
      var seen = {};
      cur.forEach(function(it) { seen[idFn(it)] = true; });
      (incoming || []).forEach(function(it) {
        var id = idFn(it);
        if (!id || seen[id]) return;
        seen[id] = true;
        cur.push(it);
      });
      return cur;
    }
    if (d.logs) writeBoth('presto_reading_log', mergeLog(d.logs));
    if (d.events) writeBoth('presto_read_events', mergeList('presto_read_events', d.events, function(e){
      return String(e.ts || '') + '|' + (e.book || '') + '|' + String(e.chapter || '');
    }));
    if (d.verses) writeBoth('presto_verse_events', mergeList('presto_verse_events', d.verses, function(e){
      return String(e.ts || '') + '|' + (e.ref || '');
    }));
    if (d.lastRead && d.lastRead.bookId) writeBoth('presto_last_read', d.lastRead);
    try { window.dispatchEvent(new Event('peiai-reading-hydrated')); } catch (e) {}
  } catch (e) {}
})();
''';
}

List<Map<String, dynamic>> _readJsonList(SharedPreferences prefs, String key) {
  final raw = userPrefGetString(prefs, key);
  if (raw == null || raw.isEmpty) return const [];
  try {
    return (jsonDecode(raw) as List).cast<Map<String, dynamic>>();
  } catch (_) {
    return const [];
  }
}
