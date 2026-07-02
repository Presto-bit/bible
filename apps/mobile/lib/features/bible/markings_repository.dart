/// 标注仓库（本地优先）：划线 / 书签。
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';

import '../../core/api_client.dart';
import '../../core/database/app_database.dart';
import '../../core/mark_notes.dart';
import '../../core/mark_ref.dart';
import '../../core/sync/sync_engine.dart';
import '../notes/notes_repository.dart' show dbProvider, syncEngineProvider;
import 'reader_marking_models.dart';

final markingsRepoProvider = Provider<MarkingsRepository>(
  (ref) => MarkingsRepository(
    ref.watch(dbProvider),
    ref.watch(syncEngineProvider),
    ref.watch(prefsProvider),
  ),
);

final highlightMapProvider = StreamProvider<Map<String, HighlightMark>>((ref) {
  final db = ref.watch(dbProvider);
  return db.watchHighlights().map((rows) {
    return {
      for (final h in rows)
        h.ref: HighlightMark(color: h.color),
    };
  });
});

final bookmarksProvider = StreamProvider<List<Bookmark>>(
  (ref) => ref.watch(dbProvider).watchBookmarks(),
);

class MarkingsRepository {
  MarkingsRepository(this._db, this._sync, this._prefs);
  final AppDatabase _db;
  final SyncEngine _sync;
  final SharedPreferences _prefs;
  static const _uuid = Uuid();

  Future<bool> toggleHighlight(String ref, {required String color}) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    final existing = await _db.highlightByRef(syncRef(ref));
    if (existing != null && existing.color == color) {
      final tomb = existing.copyWith(
          deleted: true, version: existing.version + 1, updatedAtMs: now);
      await _db.into(_db.highlights).insertOnConflictUpdate(tomb);
      await _sync.enqueueHighlight(tomb, isDelete: true);
      await unbindMarkRef(_prefs, ref);
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
        ref: syncRef(ref),
        color: color,
        version: 1,
        deleted: false,
        updatedAtMs: now,
      );
      await _db.into(_db.highlights).insertOnConflictUpdate(h);
      await _sync.enqueueHighlight(h, isDelete: false);
    }
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

VerseMarkInfo? markForVerse(Map<String, HighlightMark> map, String bookId,
    int chapter, int verse) {
  final exact = map['$bookId.$chapter.$verse'];
  if (exact != null) {
    return VerseMarkInfo(mark: exact, ref: '$bookId.$chapter.$verse');
  }
  for (final e in map.entries) {
    final p = parseMarkRef(e.key);
    if (p == null || p.bookId != bookId || p.chapter != chapter) continue;
    final start = p.verseStart;
    final end = p.verseEnd ?? p.verseStart;
    if (start == null || end == null) continue;
    if (verse >= start && verse <= end) {
      return VerseMarkInfo(
        mark: e.value,
        ref: e.key,
        spanStart: p.spanStart,
        spanEnd: p.spanEnd,
      );
    }
  }
  return null;
}
