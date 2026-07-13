/// 笔记仓库（本地优先）：写本地镜像 + 登记 outbox；读为 drift 实时流。
library;

import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../core/api_client.dart';
import '../../core/database/app_database.dart';
import '../../core/sync/profile_sync.dart';
import '../../core/sync/sync_engine.dart';

final dbProvider = Provider<AppDatabase>((ref) {
  final code = ref.watch(activeUserCodeProvider);
  final prefs = ref.watch(prefsProvider);
  final db = AppDatabase.forUser(code);
  // 异步认领旧单库；失败不影响打开
  Future.microtask(() => claimLegacyDriftIfNeeded(db, code, prefs));
  ref.onDispose(db.close);
  return db;
});

final syncEngineProvider = Provider<SyncEngine>(
  (ref) => SyncEngine(
    ref.watch(dbProvider),
    ref.watch(dioProvider),
    ref.watch(prefsProvider),
  ),
);

final profileSyncProvider = Provider<ProfileSync>(
  (ref) => ProfileSync(ref.watch(syncEngineProvider)),
);

final notesRepoProvider = Provider<NotesRepository>(
  (ref) => NotesRepository(ref.watch(dbProvider), ref.watch(syncEngineProvider)),
);

/// 本地笔记实时流（离线可用）。
final notesStreamProvider = StreamProvider<List<Note>>(
  (ref) => ref.watch(notesRepoProvider).watch(),
);

class NotesRepository {
  NotesRepository(this._db, this._sync);
  final AppDatabase _db;
  final SyncEngine _sync;
  static const _uuid = Uuid();

  Stream<List<Note>> watch() => _db.watchNotes();

  Future<Note> create({String? ref, required String body, List<String> tags = const []}) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    final note = Note(
      id: _uuid.v4(),
      ref: ref,
      body: body,
      tagsJson: jsonEncode(tags),
      isPrivate: true,
      version: 1,
      deleted: false,
      updatedAtMs: now,
    );
    await _db.into(_db.notes).insertOnConflictUpdate(note);
    await _sync.enqueueNote(note, isDelete: false);
    return note;
  }

  Future<void> edit(Note prev, {String? body, List<String>? tags}) async {
    final updated = prev.copyWith(
      body: body ?? prev.body,
      tagsJson: tags != null ? jsonEncode(tags) : prev.tagsJson,
      version: prev.version + 1,
      updatedAtMs: DateTime.now().millisecondsSinceEpoch,
    );
    await _db.into(_db.notes).insertOnConflictUpdate(updated);
    await _sync.enqueueNote(updated, isDelete: false);
  }

  Future<void> remove(Note note) async {
    final tomb = note.copyWith(
      deleted: true,
      version: note.version + 1,
      updatedAtMs: DateTime.now().millisecondsSinceEpoch,
    );
    await _db.into(_db.notes).insertOnConflictUpdate(tomb);
    await _sync.enqueueNote(tomb, isDelete: true);
  }
}
