import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../features/bible/bible_repository.dart';
import '../features/bible/markings_repository.dart';
import '../features/bible/reading_repository.dart';
import '../features/notes/notes_repository.dart' show dbProvider, syncEngineProvider;
import 'api_client.dart';
import 'badge_catalog.dart';
import 'badge_eval.dart';
import 'badge_stats.dart';
import 'gamification.dart' show readingStreak;

final badgeCatalogProvider = FutureProvider<BadgeCatalog>((ref) => BadgeCatalog.load());

Future<void> _syncBadgeUnlocks(
  SharedPreferences prefs,
  dynamic sync,
  List<BadgeDef> badges,
) async {
  const key = 'badge_unlock_at';
  final raw = prefs.getString(key);
  final map = <String, int>{};
  if (raw != null && raw.isNotEmpty) {
    try {
      final decoded = jsonDecode(raw) as Map<String, dynamic>;
      for (final e in decoded.entries) {
        map[normalizeBadgeId(e.key)] = (e.value as num).toInt();
      }
    } catch (_) {}
  }
  final now = DateTime.now().millisecondsSinceEpoch;
  var changed = false;
  for (final b in badges) {
    if (!b.done) continue;
    final id = normalizeBadgeId(b.id);
    final at = map[id] ?? now;
    if (!map.containsKey(id)) {
      map[id] = at;
      changed = true;
      await sync.enqueueBadgeUnlock(badgeId: id, unlockedAtMs: at);
    }
  }
  if (changed) {
    await prefs.setString(key, jsonEncode(map));
  }
}

final badgesProvider = FutureProvider<List<BadgeDef>>((ref) async {
  final catalog = await ref.watch(badgeCatalogProvider.future);
  final data = await ref.watch(reviewDataProvider.future);
  final books = await ref.watch(booksProvider.future);
  final prefs = ref.watch(prefsProvider);
  final sync = ref.watch(syncEngineProvider);
  final db = ref.watch(dbProvider);

  final notes = await db.watchNotes().first;
  final highlights = await db.watchHighlights().first;
  final bookmarks = await db.watchBookmarks().first;

  final totals = {for (final b in books) b.id: b.chapterCount};
  final prog = data.bookProgress(totals);
  const nt = {
    'MAT', 'MRK', 'LUK', 'JHN', 'ACT', 'ROM', '1CO', '2CO', 'GAL', 'EPH', 'PHP', 'COL',
    '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM', 'HEB', 'JAS', '1PE', '2PE', '1JN', '2JN',
    '3JN', 'JUD', 'REV',
  };
  var readBooks = 0;
  var ntBooksRead = 0;
  var otBooksRead = 0;
  for (final entry in prog.entries) {
    final p = entry.value;
    if (p.distinctChapters <= 0 && p.passes < 1) continue;
    readBooks += 1;
    if (nt.contains(entry.key)) {
      ntBooksRead += 1;
    } else {
      otBooksRead += 1;
    }
  }

  final highlightColors = highlights.map((h) => h.color).toSet().length;
  final maxNoteLen = notes.isEmpty
      ? 0
      : notes.map((n) => n.body.length).reduce((a, b) => a > b ? a : b);

  final specs = catalog.specs
      .map((s) => {
            'id': s.id,
            'label': s.label,
            'desc': s.desc,
            'hint': s.hint,
            'icon': s.icon,
            'category': s.category,
            'interesting': s.interesting,
            'rule': s.rule,
            'progress': s.progress,
          })
      .toList();

  final ctx = BadgeCtx(
    streak: readingStreak(data),
    readBooks: readBooks,
    ntBooksRead: ntBooksRead,
    otBooksRead: otBooksRead,
    totalBooks: books.length,
    noteCount: notes.length,
    monthDays: 0,
    totalMinutes: data.minutesByDay.values.fold(0, (a, b) => a + b),
    totalChapters: data.chaptersByDay.values.fold(0, (a, b) => a + b),
    highlightCount: highlights.length,
    highlightColors: highlightColors,
    bookmarkCount: bookmarks.length,
    thoughtCount: 0,
    maxNoteLen: maxNoteLen,
    planDays: 0,
    friendCount: 0,
    bookTotals: totals,
    chapterEvents: data.chapterEvents,
    verseEvents: data.verseEvents,
    stats: BadgeStats.load(prefs),
  );

  final badges = _attachUnlockTimestamps(prefs, evaluateAllBadges(specs, ctx));
  await _syncBadgeUnlocks(prefs, sync, badges);
  return badges;
});

Map<String, int> _readUnlockMap(SharedPreferences prefs) {
  const key = 'badge_unlock_at';
  final raw = prefs.getString(key);
  final map = <String, int>{};
  if (raw == null || raw.isEmpty) return map;
  try {
    final decoded = jsonDecode(raw) as Map<String, dynamic>;
    for (final e in decoded.entries) {
      final id = normalizeBadgeId(e.key);
      final at = (e.value as num).toInt();
      map[id] = map.containsKey(id) ? (map[id]! < at ? map[id]! : at) : at;
    }
  } catch (_) {}
  return map;
}

List<BadgeDef> _attachUnlockTimestamps(SharedPreferences prefs, List<BadgeDef> badges) {
  final map = _readUnlockMap(prefs);
  final now = DateTime.now().millisecondsSinceEpoch;
  return badges.map((b) {
    if (!b.done) return b;
    final at = map[normalizeBadgeId(b.id)] ?? now;
    return BadgeDef(
      id: b.id,
      label: b.label,
      desc: b.desc,
      hint: b.hint,
      icon: b.icon,
      category: b.category,
      interesting: b.interesting,
      done: b.done,
      progress: b.progress,
      unlockedAt: at,
    );
  }).toList();
}
