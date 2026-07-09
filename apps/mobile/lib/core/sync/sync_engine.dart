/// 增量同步客户端：outbox 上行（push）+ 游标下行（pull）+ 行级 LWW 合并。
///
/// 多实体支持，与后端 services/api/app/sync registry 对齐：
///   versioned（id + version + 软删 tombstone）：note / highlight / bookmark
///   非 versioned（复合键/单例 + 物理删）：plan_progress / reading_progress
library;

import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:drift/drift.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../database/app_database.dart';
import '../badge_catalog.dart' show normalizeBadgeId;
import '../features/plans/plan_session.dart';
import 'sync_contract.dart';

class SyncResult {
  SyncResult({this.pushed = 0, this.skipped = 0, this.pulled = 0, this.cursor = 0});
  final int pushed;
  final int skipped;
  final int pulled;
  final int cursor;

  @override
  String toString() =>
      'pushed=$pushed skipped=$skipped pulled=$pulled cursor=$cursor';
}

class SyncEngine {
  SyncEngine(this._db, this._dio, this._prefs);

  final AppDatabase _db;
  final Dio _dio;
  final SharedPreferences? _prefs;

  static const _kCursor = 'sync_cursor';

  String _iso(int ms) =>
      DateTime.fromMillisecondsSinceEpoch(ms, isUtc: true).toIso8601String();

  // ── 本地写 → outbox（按实体登记信封） ───────────────────────────
  Future<void> _enqueue(String entity, Map<String, dynamic> envelope) async {
    await _db.into(_db.outbox).insert(OutboxCompanion.insert(
          entity: entity,
          op: envelope['op'] as String,
          envelopeJson: jsonEncode(envelope),
          createdAtMs: DateTime.now().millisecondsSinceEpoch,
        ));
  }

  Future<void> enqueueNote(Note n, {required bool isDelete}) => _enqueue('note', {
        'entity': 'note',
        'op': isDelete ? 'delete' : 'update',
        'id': n.id,
        'version': n.version,
        'client_ts': _iso(n.updatedAtMs),
        if (!isDelete)
          'data': {
            'ref': n.ref,
            'body': n.body,
            'tags': (jsonDecode(n.tagsJson) as List).cast<String>(),
            'is_private': n.isPrivate,
          },
      });

  Future<void> enqueueHighlight(Highlight h, {required bool isDelete}) =>
      _enqueue('highlight', {
        'entity': 'highlight',
        'op': isDelete ? 'delete' : 'update',
        'id': h.id,
        'version': h.version,
        'client_ts': _iso(h.updatedAtMs),
        if (!isDelete) 'data': {'ref': h.ref, 'color': h.color},
      });

  Future<void> enqueueBookmark(Bookmark b, {required bool isDelete}) =>
      _enqueue('bookmark', {
        'entity': 'bookmark',
        'op': isDelete ? 'delete' : 'update',
        'id': b.id,
        'version': b.version,
        'client_ts': _iso(b.updatedAtMs),
        if (!isDelete) 'data': {'ref': b.ref},
      });

  Future<void> enqueueAiSession(AiSession s, {required bool isDelete}) =>
      _enqueue('ai_session', {
        'entity': 'ai_session',
        'op': isDelete ? 'delete' : 'update',
        'id': s.id,
        'version': s.version,
        'client_ts': _iso(s.updatedAtMs),
        if (!isDelete)
          'data': {'title': s.title, 'anchor_ref': s.anchorRef},
      });

  Future<void> enqueuePlanProgress(PlanProgressData p, {PlanSession? session}) =>
      _enqueue('plan_progress', {
        'entity': 'plan_progress',
        'op': 'update',
        'keys': {'plan_id': p.planId},
        'client_ts': _iso(p.updatedAtMs),
        'data': {
          'day': p.day,
          'status': p.status,
          if (session != null) 'session': session.toSyncJson(),
        },
      });

  Future<void> enqueueReadingLog(ReadingLog r) =>
      _enqueue('reading_log', {
        'entity': 'reading_log',
        'op': 'update',
        'keys': {'date': r.date},
        'client_ts': _iso(r.updatedAtMs),
        'data': {'minutes': r.minutes, 'chapters': r.chapters},
      });

  Future<void> enqueueReadEvent({
    required String id,
    required int ts,
    required String book,
    required int chapter,
  }) =>
      _enqueue('read_event', {
        'entity': 'read_event',
        'op': 'update',
        'id': id,
        'version': 1,
        'client_ts': _iso(ts),
        'data': {'ts': ts, 'book': book.toUpperCase(), 'chapter': chapter},
      });

  Future<void> enqueueBadgeUnlock({
    required String badgeId,
    required int unlockedAtMs,
  }) =>
      _enqueue('badge_unlock', {
        'entity': 'badge_unlock',
        'op': 'update',
        'id': badgeId,
        'version': 1,
        'client_ts': _iso(unlockedAtMs),
        'data': {'badge_id': badgeId, 'unlocked_at': unlockedAtMs},
      });

  Future<void> enqueueReadingProgress(ReadingProgressData r) =>
      _enqueue('reading_progress', {
        'entity': 'reading_progress',
        'op': 'update',
        'client_ts': _iso(r.updatedAtMs),
        'data': {'book': r.book, 'chapter': r.chapter, 'verse': r.verse},
      });

  // ── push ─────────────────────────────────────────────────────────
  Future<({int applied, int skipped})> push() async {
    final rows = await (_db.select(_db.outbox)
          ..orderBy([(t) => OrderingTerm.asc(t.seq)]))
        .get();
    if (rows.isEmpty) return (applied: 0, skipped: 0);

    final changes = rows
        .map((r) => jsonDecode(r.envelopeJson) as Map<String, dynamic>)
        .toList();
    final res = await _dio.post('/sync/push', data: {'changes': changes});
    final applied = (res.data['applied'] ?? 0) as int;
    final skipped = (res.data['skipped'] ?? 0) as int;

    final seqs = rows.map((r) => r.seq).toList();
    await (_db.delete(_db.outbox)..where((t) => t.seq.isIn(seqs))).go();
    return (applied: applied, skipped: skipped);
  }

  // ── pull ─────────────────────────────────────────────────────────
  Future<({int pulled, int cursor})> pull() async {
    final since = int.tryParse(await _db.meta(_kCursor) ?? '0') ?? 0;
    final res = await _dio.get('/sync/pull', queryParameters: {
      'since': since,
      'entities': SyncContract.pullEntities.join(','),
    });
    final changes = (res.data['changes'] ?? []) as List;
    var pulled = 0;
    for (final c in changes.cast<Map<String, dynamic>>()) {
      if (await _apply(c)) pulled++;
    }
    final cursor = (res.data['cursor'] ?? since) as int;
    await _db.setMeta(_kCursor, '$cursor');
    return (pulled: pulled, cursor: cursor);
  }

  Future<bool> _apply(Map<String, dynamic> c) async {
    switch (c['entity'] as String?) {
      case 'note':
        return _applyNote(c);
      case 'highlight':
        return _applyHighlight(c);
      case 'bookmark':
        return _applyBookmark(c);
      case 'ai_session':
        return _applyAiSession(c);
      case 'reading_log':
        return _applyReadingLog(c);
      case 'read_event':
        return _applyReadEvent(c);
      case 'badge_unlock':
        return _applyBadgeUnlock(c);
      case 'plan_progress':
        return _applyPlanProgress(c);
      case 'reading_progress':
        return _applyReadingProgress(c);
      default:
        return false;
    }
  }

  Future<bool> _applyNote(Map<String, dynamic> c) async {
    final id = c['id'] as String;
    final v = (c['version'] ?? 1) as int;
    final isDelete = c['op'] == 'delete';
    final ms = _tsToMs(c['updated_at']);
    final local = await _db.noteById(id);
    if (local != null && v < local.version) return false;
    if (isDelete) {
      await _db.into(_db.notes).insertOnConflictUpdate(NotesCompanion(
            id: Value(id),
            version: Value(v),
            deleted: const Value(true),
            updatedAtMs: Value(ms),
            body: Value(local?.body ?? ''),
          ));
      return true;
    }
    final data = (c['data'] ?? const {}) as Map<String, dynamic>;
    final tags = ((data['tags'] ?? const []) as List).cast<String>();
    await _db.into(_db.notes).insertOnConflictUpdate(NotesCompanion(
          id: Value(id),
          ref: Value(data['ref'] as String?),
          body: Value((data['body'] ?? '') as String),
          tagsJson: Value(jsonEncode(tags)),
          isPrivate: Value((data['is_private'] ?? true) as bool),
          version: Value(v),
          deleted: const Value(false),
          updatedAtMs: Value(ms),
        ));
    return true;
  }

  Future<bool> _applyHighlight(Map<String, dynamic> c) async {
    final id = c['id'] as String;
    final v = (c['version'] ?? 1) as int;
    final ms = _tsToMs(c['updated_at']);
    final local = await _db.highlightById(id);
    if (local != null && v < local.version) return false;
    final data = (c['data'] ?? const {}) as Map<String, dynamic>;
    await _db.into(_db.highlights).insertOnConflictUpdate(HighlightsCompanion(
          id: Value(id),
          ref: Value((data['ref'] ?? local?.ref ?? '') as String),
          color: Value((data['color'] ?? 'yellow') as String),
          version: Value(v),
          deleted: Value(c['op'] == 'delete'),
          updatedAtMs: Value(ms),
        ));
    return true;
  }

  Future<bool> _applyBookmark(Map<String, dynamic> c) async {
    final id = c['id'] as String;
    final v = (c['version'] ?? 1) as int;
    final ms = _tsToMs(c['updated_at']);
    final data = (c['data'] ?? const {}) as Map<String, dynamic>;
    await _db.into(_db.bookmarks).insertOnConflictUpdate(BookmarksCompanion(
          id: Value(id),
          ref: Value((data['ref'] ?? '') as String),
          version: Value(v),
          deleted: Value(c['op'] == 'delete'),
          updatedAtMs: Value(ms),
        ));
    return true;
  }

  Future<bool> _applyAiSession(Map<String, dynamic> c) async {
    final id = c['id'] as String;
    final v = (c['version'] ?? 1) as int;
    final ms = _tsToMs(c['updated_at']);
    final local = await _db.sessionById(id);
    if (local != null && v < local.version) return false;
    final data = (c['data'] ?? const {}) as Map<String, dynamic>;
    await _db.into(_db.aiSessions).insertOnConflictUpdate(AiSessionsCompanion(
          id: Value(id),
          title: Value((data['title'] ?? local?.title ?? '新会话') as String),
          anchorRef: Value(data['anchor_ref'] as String? ?? local?.anchorRef),
          version: Value(v),
          deleted: Value(c['op'] == 'delete'),
          updatedAtMs: Value(ms),
        ));
    return true;
  }

  Future<bool> _applyPlanProgress(Map<String, dynamic> c) async {
    final keys = (c['keys'] ?? const {}) as Map<String, dynamic>;
    final planId = keys['plan_id'] as String?;
    if (planId == null) return false;
    final ms = _tsToMs(c['updated_at']);
    if (c['op'] == 'delete') {
      await (_db.delete(_db.planProgress)
            ..where((t) => t.planId.equals(planId)))
          .go();
      return true;
    }
    final data = (c['data'] ?? const {}) as Map<String, dynamic>;
    await _db.into(_db.planProgress).insertOnConflictUpdate(PlanProgressCompanion(
          planId: Value(planId),
          day: Value((data['day'] ?? 0) as int),
          status: Value((data['status'] ?? 'active') as String),
          updatedAtMs: Value(ms),
        ));
    final sessionRaw = data['session'];
    if (_prefs != null && sessionRaw is Map) {
      await applyRemoteSession(
        _prefs!,
        planId,
        (data['day'] ?? 1) as int,
        Map<String, dynamic>.from(sessionRaw),
      );
    }
    return true;
  }

  Future<bool> _applyReadingLog(Map<String, dynamic> c) async {
    final keys = (c['keys'] ?? const {}) as Map<String, dynamic>;
    final date = keys['date'] as String?;
    if (date == null) return false;
    final ms = _tsToMs(c['updated_at']);
    if (c['op'] == 'delete') {
      await (_db.delete(_db.readingLogs)..where((t) => t.date.equals(date)))
          .go();
      return true;
    }
    final data = (c['data'] ?? const {}) as Map<String, dynamic>;
    final incM = (data['minutes'] ?? 0) as int;
    final incC = (data['chapters'] ?? 0) as int;
    final prev = await _db.readingLogByDate(date);
    final mergedM = SyncContract.mergeMinutes(prev?.minutes ?? 0, incM);
    final mergedC = SyncContract.mergeChapters(prev?.chapters ?? 0, incC);
    if (prev != null && mergedM == prev.minutes && mergedC == prev.chapters) {
      return false;
    }
    await _db.into(_db.readingLogs).insertOnConflictUpdate(ReadingLogsCompanion(
          date: Value(date),
          minutes: Value(mergedM),
          chapters: Value(mergedC),
          updatedAtMs: Value(ms),
        ));
    return true;
  }

  Future<bool> _applyReadEvent(Map<String, dynamic> c) async {
    if (_prefs == null) return false;
    final id = c['id'] as String?;
    if (id == null) return false;
    if (c['op'] == 'delete') return false;
    final data = (c['data'] ?? const {}) as Map<String, dynamic>;
    final ts = (data['ts'] as num?)?.toInt();
    final book = data['book'] as String?;
    final chapter = (data['chapter'] as num?)?.toInt();
    if (ts == null || book == null || chapter == null) return false;
    const key = 'read_chapter_events';
    final raw = _prefs!.getString(key);
    final list = <Map<String, dynamic>>[];
    if (raw != null && raw.isNotEmpty) {
      try {
        list.addAll((jsonDecode(raw) as List).cast<Map<String, dynamic>>());
      } catch (_) {}
    }
    final syncId = SyncContract.readEventSyncId(book, chapter, ts);
    if (list.any((e) =>
        SyncContract.readEventSyncId(
              '${e['book']}',
              (e['chapter'] as num).toInt(),
              (e['ts'] as num).toInt(),
            ) ==
            syncId)) {
      return false;
    }
    list.add({'ts': ts, 'book': book.toUpperCase(), 'chapter': chapter});
    if (list.length > 2000) {
      list.removeRange(0, list.length - 2000);
    }
    await _prefs!.setString(key, jsonEncode(list));
    return true;
  }

  Future<bool> _applyBadgeUnlock(Map<String, dynamic> c) async {
    if (_prefs == null) return false;
    final id = normalizeBadgeId(c['id'] as String? ?? '');
    if (id.isEmpty) return false;
    if (c['op'] == 'delete') return false;
    final data = (c['data'] ?? const {}) as Map<String, dynamic>;
    final at = (data['unlocked_at'] as num?)?.toInt();
    if (at == null) return false;
    const key = 'badge_unlock_at';
    final raw = _prefs!.getString(key);
    final map = <String, int>{};
    if (raw != null && raw.isNotEmpty) {
      try {
        final decoded = jsonDecode(raw) as Map<String, dynamic>;
        for (final e in decoded.entries) {
          map[normalizeBadgeId(e.key)] = (e.value as num).toInt();
        }
      } catch (_) {}
    }
    final prev = map[id];
    map[id] = prev == null ? at : (prev < at ? prev : at);
    await _prefs!.setString(key, jsonEncode(map));
    return true;
  }

  Future<bool> _applyReadingProgress(Map<String, dynamic> c) async {
    final ms = _tsToMs(c['updated_at']);
    final data = (c['data'] ?? const {}) as Map<String, dynamic>;
    if (data['book'] == null) return false;
    final local = await _db.currentReadingProgress();
    final remoteBook = data['book'] as String;
    final remoteChapter = (data['chapter'] ?? 1) as int;
    final remoteVerse = (data['verse'] ?? 1) as int;
    if (local != null) {
      final sameBook = local.book == remoteBook;
      final ahead = sameBook &&
          (remoteChapter > local.chapter ||
              (remoteChapter == local.chapter && remoteVerse > local.verse));
      if (!ahead && ms <= local.updatedAtMs) return false;
    }
    await _db
        .into(_db.readingProgress)
        .insertOnConflictUpdate(ReadingProgressCompanion(
          singleton: const Value(0),
          book: Value(remoteBook),
          chapter: Value(remoteChapter),
          verse: Value(remoteVerse),
          updatedAtMs: Value(ms),
        ));
    return true;
  }

  // ── 一键全量 ──
  Future<int> pendingCount() async {
    final rows = await _db.select(_db.outbox).get();
    return rows.length;
  }

  Future<SyncResult> syncOnce() async {
    final p = await push();
    final q = await pull();
    return SyncResult(
        pushed: p.applied, skipped: p.skipped, pulled: q.pulled, cursor: q.cursor);
  }

  int _tsToMs(dynamic iso) {
    if (iso == null) return DateTime.now().millisecondsSinceEpoch;
    final dt = DateTime.tryParse(iso as String);
    return (dt ?? DateTime.now()).millisecondsSinceEpoch;
  }
}
