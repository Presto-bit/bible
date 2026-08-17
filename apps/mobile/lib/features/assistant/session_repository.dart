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

  /// 首条用户消息截断，作历史预览（对齐 PWA session.preview）。
  Future<String?> previewOf(String sid) async {
    final msgs = await (_db.select(_db.chatMessages)
          ..where((t) => t.sessionId.equals(sid))
          ..orderBy([(t) => OrderingTerm.asc(t.createdAtMs)])
          ..limit(12))
        .get();
    for (final m in msgs) {
      if (m.role == 'user' && m.content.trim().isNotEmpty) {
        final t = m.content.trim().replaceAll(RegExp(r'\s+'), ' ');
        return t.length > 48 ? '${t.substring(0, 48)}…' : t;
      }
    }
    for (final m in msgs) {
      if (m.role == 'assistant' && m.content.trim().isNotEmpty) {
        final t = m.content.trim().replaceAll(RegExp(r'\s+'), ' ');
        return t.length > 48 ? '${t.substring(0, 48)}…' : t;
      }
    }
    return null;
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

  /// 同锚点 · 中国当天续用（PRODUCT §5.3）；否则 null → 新建。
  Future<AiSession?> findResumableSession(String? anchorRef) async {
    final key = normalizeSessionRef(anchorRef);
    if (key.isEmpty) return null;
    final today = _chinaTodayYmd();
    final list = await _db.watchSessions().first;
    for (final s in list) {
      if (s.deleted) continue;
      if (normalizeSessionRef(s.anchorRef) != key) continue;
      final day = _ymdFromMs(s.updatedAtMs);
      if (day == today) return s;
    }
    return null;
  }

  /// 对齐 PWA `normalizeSessionRef`：大写、去掉 @译本后缀。
  static String normalizeSessionRef(String? ref) {
    final t = (ref ?? '').trim().toUpperCase();
    if (t.isEmpty) return '';
    final at = t.indexOf('@');
    return at < 0 ? t : t.substring(0, at);
  }

  static String _chinaTodayYmd() {
    final cn = DateTime.now().toUtc().add(const Duration(hours: 8));
    final y = cn.year.toString().padLeft(4, '0');
    final m = cn.month.toString().padLeft(2, '0');
    final d = cn.day.toString().padLeft(2, '0');
    return '$y-$m-$d';
  }

  static String _ymdFromMs(int ms) {
    final cn = DateTime.fromMillisecondsSinceEpoch(ms, isUtc: true)
        .add(const Duration(hours: 8));
    final y = cn.year.toString().padLeft(4, '0');
    final m = cn.month.toString().padLeft(2, '0');
    final d = cn.day.toString().padLeft(2, '0');
    return '$y-$m-$d';
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
