/// 小爱会话仓库：会话元数据云同步（ai_session），消息历史仅本地。
library;

import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../core/database/app_database.dart';
import '../notes/notes_repository.dart' show dbProvider, syncEngineProvider;
import 'assistant_format.dart';
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
    if (!isDefaultSessionTitle(s.title, s.anchorRef, firstText)) return;
    final t = firstText.trim();
    if (t.isEmpty) return;
    await rename(s, t.length > 18 ? '${t.substring(0, 18)}…' : t);
  }

  static const historyRetentionMs = 30 * 24 * 60 * 60 * 1000;

  Future<bool> _hasUserMessage(String sid) async {
    final rows = await (_db.select(_db.chatMessages)
          ..where((t) => t.sessionId.equals(sid) & t.role.equals('user'))
          ..limit(8))
        .get();
    return rows.any((m) => m.content.trim().isNotEmpty);
  }

  /// 历史抽屉：有用户提问且 30 天内。
  Future<List<AiSession>> visibleSessions() async {
    final cutoff =
        DateTime.now().millisecondsSinceEpoch - historyRetentionMs;
    final list = await _db.watchSessions().first;
    final out = <AiSession>[];
    for (final s in list) {
      if (s.deleted) continue;
      if (s.updatedAtMs < cutoff) continue;
      if (await _hasUserMessage(s.id)) out.add(s);
    }
    return out;
  }

  /// 末条小爱回答摘要（无则回落最近用户问）。
  Future<String?> previewOf(String sid) async {
    final msgs = await (_db.select(_db.chatMessages)
          ..where((t) => t.sessionId.equals(sid))
          ..orderBy([(t) => OrderingTerm.desc(t.createdAtMs)])
          ..limit(24))
        .get();
    for (final m in msgs) {
      if (m.role == 'assistant' && m.content.trim().isNotEmpty) {
        return clipSessionText(bodyText(m.content), 40);
      }
    }
    for (final m in msgs) {
      if (m.role == 'user' && m.content.trim().isNotEmpty) {
        return clipSessionText(m.content, 40);
      }
    }
    return null;
  }

  Future<String> displayTitleOf(AiSession s) async {
    if (!isDefaultSessionTitle(s.title, s.anchorRef)) {
      return clipSessionText(s.title, 18);
    }
    final msgs = await (_db.select(_db.chatMessages)
          ..where((t) => t.sessionId.equals(s.id))
          ..orderBy([(t) => OrderingTerm.asc(t.createdAtMs)])
          ..limit(12))
        .get();
    for (final m in msgs) {
      if (m.role == 'user' && m.content.trim().isNotEmpty) {
        return clipSessionText(m.content, 18);
      }
    }
    return '随问';
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

  static const resumeWindowMs = 72 * 60 * 60 * 1000;

  /// 同锚点 · 72 小时内续用（对齐 PWA findResumableSession）；否则 null → 新建。
  Future<AiSession?> findResumableSession(String? anchorRef) async {
    final key = normalizeSessionRef(anchorRef);
    if (key.isEmpty) return null;
    final cutoff = DateTime.now().millisecondsSinceEpoch - resumeWindowMs;
    final list = await _db.watchSessions().first;
    for (final s in list) {
      if (s.deleted) continue;
      if (normalizeSessionRef(s.anchorRef) != key) continue;
      if (s.updatedAtMs < cutoff) continue;
      if (await _hasUserMessage(s.id)) return s;
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
}

String clipSessionText(String raw, int max) {
  final t = raw.trim().replaceAll(RegExp(r'\s+'), ' ');
  if (t.isEmpty) return '';
  return t.length > max ? '${t.substring(0, max)}…' : t;
}

bool isDefaultSessionTitle(String title, String? ref, [String? firstUser]) {
  final t = title.trim();
  if (t.isEmpty || t == '新会话' || t == '随问') return true;
  if (t.startsWith('关于 ')) return true;
  final key = SessionRepository.normalizeSessionRef(ref);
  if (key.isNotEmpty && t.toUpperCase() == key) return true;
  if (ref != null && t == ref) return true;
  final first = clipSessionText(firstUser ?? '', 18);
  if (first.isNotEmpty && t == first) return true;
  return false;
}

int _diffLocalDays(int ms) {
  final now = DateTime.now();
  final today0 = DateTime(now.year, now.month, now.day);
  final day = DateTime.fromMillisecondsSinceEpoch(ms);
  final d0 = DateTime(day.year, day.month, day.day);
  return today0.difference(d0).inDays;
}

String formatSessionGroupLabel(int ms) {
  final diff = _diffLocalDays(ms);
  if (diff <= 0) return '今天';
  if (diff == 1) return '昨天';
  if (diff < 7) return '本周';
  return '更早';
}

bool isHistoryGroupExpandedByDefault(String label) =>
    label == '今天' || label == '昨天';

String formatSessionRowTime(int ms) {
  final diff = _diffLocalDays(ms);
  final d = DateTime.fromMillisecondsSinceEpoch(ms);
  String pad(int n) => n.toString().padLeft(2, '0');
  if (diff <= 0) return '${pad(d.hour)}:${pad(d.minute)}';
  if (diff == 1) return '昨天';
  if (diff < 7) {
    const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return days[d.weekday % 7];
  }
  return '${pad(d.month)}-${pad(d.day)}';
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
