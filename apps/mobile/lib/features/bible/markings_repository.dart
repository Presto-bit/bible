/// 标注仓库（本地优先）：划线 / 书签。
library;

import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';

import '../../core/api_client.dart';
import '../../core/database/app_database.dart';
import '../../core/sync/sync_engine.dart';
import '../notes/notes_repository.dart' show dbProvider, syncEngineProvider;
import 'reader_marking_models.dart';

const _hlStyleKey = 'reader_highlight_styles_v1';

final markingsRepoProvider = Provider<MarkingsRepository>(
  (ref) => MarkingsRepository(
    ref.watch(dbProvider),
    ref.watch(syncEngineProvider),
    ref.watch(prefsProvider),
  ),
);

/// ref(osis) → 划线样式。
final highlightMapProvider = StreamProvider<Map<String, HighlightMark>>((ref) {
  final db = ref.watch(dbProvider);
  final prefs = ref.watch(prefsProvider);
  return db.watchHighlights().map((rows) {
    final styles = _readStyles(prefs);
    return {
      for (final h in rows)
        h.ref: HighlightMark(
          color: h.color,
          style: HighlightStyleX.fromKey(styles[h.ref]),
        ),
    };
  });
});

final bookmarksProvider = StreamProvider<List<Bookmark>>(
  (ref) => ref.watch(dbProvider).watchBookmarks(),
);

Map<String, String> _readStyles(SharedPreferences prefs) {
  try {
    final raw = prefs.getString(_hlStyleKey);
    if (raw == null || raw.isEmpty) return {};
    return Map<String, String>.from(jsonDecode(raw) as Map);
  } catch (_) {
    return {};
  }
}

Future<void> _writeStyles(
    SharedPreferences prefs, Map<String, String> map) async {
  await prefs.setString(_hlStyleKey, jsonEncode(map));
}

class MarkingsRepository {
  MarkingsRepository(this._db, this._sync, this._prefs);
  final AppDatabase _db;
  final SyncEngine _sync;
  final SharedPreferences _prefs;
  static const _uuid = Uuid();

  Future<bool> toggleHighlight(
    String ref, {
    required String color,
    required HighlightStyle style,
  }) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    final styles = _readStyles(_prefs);
    final existing = await _db.highlightByRef(ref);
    if (existing != null &&
        existing.color == color &&
        (styles[ref] ?? 'color') == style.key) {
      final tomb = existing.copyWith(
          deleted: true, version: existing.version + 1, updatedAtMs: now);
      await _db.into(_db.highlights).insertOnConflictUpdate(tomb);
      await _sync.enqueueHighlight(tomb, isDelete: true);
      styles.remove(ref);
      await _writeStyles(_prefs, styles);
      return false;
    }
    if (existing != null) {
      final upd = existing.copyWith(
        color: color,
        version: existing.version + 1,
        updatedAtMs: now,
      );
      await _db.into(_db.highlights).insertOnConflictUpdate(upd);
      await _sync.enqueueHighlight(upd, isDelete: false);
    } else {
      final h = Highlight(
        id: _uuid.v4(),
        ref: ref,
        color: color,
        version: 1,
        deleted: false,
        updatedAtMs: now,
      );
      await _db.into(_db.highlights).insertOnConflictUpdate(h);
      await _sync.enqueueHighlight(h, isDelete: false);
    }
    styles[ref] = style.key;
    await _writeStyles(_prefs, styles);
    return true;
  }

  Future<bool> toggleBookmark(String ref) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    final existing = await _db.bookmarkByRef(ref);
    if (existing != null) {
      final tomb = existing.copyWith(
          deleted: true, version: existing.version + 1, updatedAtMs: now);
      await _db.into(_db.bookmarks).insertOnConflictUpdate(tomb);
      await _sync.enqueueBookmark(tomb, isDelete: true);
      return false;
    }
    final b = Bookmark(
        id: _uuid.v4(),
        ref: ref,
        version: 1,
        deleted: false,
        updatedAtMs: now);
    await _db.into(_db.bookmarks).insertOnConflictUpdate(b);
    await _sync.enqueueBookmark(b, isDelete: false);
    return true;
  }
}

HighlightMark? markForVerse(Map<String, HighlightMark> map, String bookId,
    int chapter, int verse) {
  final exact = map['$bookId.$chapter.$verse'];
  if (exact != null) return exact;
  for (final e in map.entries) {
    final parts = e.key.split('.');
    if (parts.length < 3) continue;
    if (parts[0] != bookId || int.tryParse(parts[1]) != chapter) continue;
    final tail = parts[2];
    if (tail.contains('-')) {
      final r = tail.split('-');
      final start = int.tryParse(r[0]);
      final end = int.tryParse(r.length > 1 ? r[1] : r[0]);
      if (start != null &&
          end != null &&
          verse >= start &&
          verse <= end) {
        return e.value;
      }
    }
  }
  return null;
}
