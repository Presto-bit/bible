/// 小爱会话仓库：会话元数据云同步（ai_session），消息历史仅本地。
library;

import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../core/database/app_database.dart';
import '../notes/notes_repository.dart' show dbProvider, syncEngineProvider;
import 'models.dart';

class SessionRepository {
  SessionRepository(this._db, this._sync);
  final AppDatabase _db;
  final dynamic _sync;
  static const _uuid = Uuid();

  Stream<List<AiSession>> watchSessions() =>
      _db.watchSessions().handleError((_, __) {});
  Stream<List<ChatMessage>> watchMessages(String sid) =>
      _db.watchMessages(sid);
  Future<AiSession?> session(String id) => _db.sessionById(id);

  Future<String> createSession({String? anchorRef, String? title}) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    final id = _uuid.v4();
    final s = AiSession(
      id: id,
      title: title ?? (anchorRef != null ? '关于 $anchorRef' : '新会话'),
      anchorRef: anchorRef,
      version: 1,
      deleted: false,
      updatedAtMs: now,
    );
    await _db.into(_db.aiSessions).insertOnConflictUpdate(s);
    try {
      await _sync.enqueueAiSession(s, isDelete: false);
    } catch (_) {
      // 云同步失败不阻断本地会话
    }
    return id;
  }

  Future<void> rename(AiSession s, String title) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    final next =
        s.copyWith(title: title, version: s.version + 1, updatedAtMs: now);
    await _db.into(_db.aiSessions).insertOnConflictUpdate(next);
    try {
      await _sync.enqueueAiSession(next, isDelete: false);
    } catch (_) {}
  }

  Future<void> delete(AiSession s) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    final next =
        s.copyWith(deleted: true, version: s.version + 1, updatedAtMs: now);
    await _db.into(_db.aiSessions).insertOnConflictUpdate(next);
    await _db.deleteMessages(s.id);
    try {
      await _sync.enqueueAiSession(next, isDelete: true);
    } catch (_) {}
  }

  /// 首条用户消息后用其内容作为会话标题（仍为默认标题时）。
  Future<void> maybeTitleFromFirst(String sid, String firstText) async {
    final s = await _db.sessionById(sid);
    if (s == null) return;
    if (s.title == '新会话' && firstText.trim().isNotEmpty) {
      final t = firstText.trim();
      await rename(s, t.length > 18 ? '${t.substring(0, 18)}…' : t);
    }
  }

  Future<void> addMessage(
    String sid,
    String role,
    String content, {
    List<Citation> citations = const [],
  }) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    await _db.into(_db.chatMessages).insert(ChatMessage(
          id: _uuid.v4(),
          sessionId: sid,
          role: role,
          content: content,
          citationsJson: jsonEncode(citations
              .map((c) => {
                    'n': c.n,
                    'title': c.title,
                    if (c.snippet != null) 'snippet': c.snippet,
                  })
              .toList()),
          createdAtMs: now,
        ));
    // 触达会话使其排序靠前
    final s = await _db.sessionById(sid);
    if (s != null) {
      await (_db.update(_db.aiSessions)..where((t) => t.id.equals(sid)))
          .write(AiSessionsCompanion(updatedAtMs: Value(now)));
    }
  }
}

final sessionRepoProvider = Provider<SessionRepository>((ref) =>
    SessionRepository(ref.read(dbProvider), ref.read(syncEngineProvider)));

final sessionsStreamProvider = StreamProvider<List<AiSession>>((ref) async* {
  // 立刻 yield，避免历史抽屉一直 loading
  yield const <AiSession>[];
  try {
    await for (final list in ref.read(sessionRepoProvider).watchSessions()) {
      yield list;
    }
  } catch (_) {
    yield const <AiSession>[];
  }
});

List<Citation> citationsFromJson(String json) {
  final raw = json.trim();
  if (raw.isEmpty) return const [];
  try {
    final decoded = jsonDecode(raw);
    if (decoded is! List) return const [];
    return decoded
        .map((e) {
          if (e is! Map) {
            return Citation(n: 0, title: '', score: 0);
          }
          return Citation(
            n: (e['n'] ?? 0) as int,
            title: (e['title'] ?? '') as String,
            score: 0,
            snippet: e['snippet'] as String?,
          );
        })
        .toList();
  } catch (_) {
    return const [];
  }
}
