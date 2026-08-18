/// 经文想法：本地 JSON 存储 + 点赞 + 共享展示。
library;

import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/api_client.dart';
import '../../core/user_storage.dart';
import '../../core/mark_ref.dart' show parseMarkRef;
import 'markings_repository.dart';
import 'thought_sync.dart';

export '../../core/mark_ref.dart' show selectionRef;

const _thoughtsKey = 'verse_thoughts_v1';

enum ThoughtVisibility { public, friends, private }

/// 对齐 PWA `reader_thoughts.ts`：公开 / 共读 / 私密。
String visibilityLabel(ThoughtVisibility v) => switch (v) {
  ThoughtVisibility.public => '公开',
  ThoughtVisibility.friends => '共读',
  ThoughtVisibility.private => '私密',
};

String visibilityHint(ThoughtVisibility v) => switch (v) {
  ThoughtVisibility.public => '读同一节经文的任何人都可见',
  ThoughtVisibility.friends => '仅你的好友可见',
  ThoughtVisibility.private => '仅自己可见',
};

const _visPrefKey = 'thought_visibility_pref';

/// 默认可见范围：记忆上次选择，否则公开。
ThoughtVisibility getDefaultVisibility([String context = 'normal']) {
  if (context == 'mark') return ThoughtVisibility.private;
  return ThoughtVisibility.public;
}

ThoughtVisibility loadRememberedVisibility(SharedPreferences prefs) {
  final raw = prefs.getString(_visPrefKey);
  return switch (raw) {
    'public' => ThoughtVisibility.public,
    'friends' => ThoughtVisibility.friends,
    'private' => ThoughtVisibility.private,
    _ => ThoughtVisibility.public,
  };
}

Future<void> rememberVisibility(
  SharedPreferences prefs,
  ThoughtVisibility v,
) async {
  await prefs.setString(_visPrefKey, v.name);
}

ThoughtVisibility _parseVisibility(dynamic raw, {bool? legacyShared}) {
  if (raw == 'public' || raw == 'friends' || raw == 'private') {
    return ThoughtVisibility.values.byName(raw as String);
  }
  if (legacyShared == false) return ThoughtVisibility.private;
  return ThoughtVisibility.public;
}

class VerseThoughtData {
  VerseThoughtData({
    required this.id,
    required this.ref,
    required this.body,
    required this.authorId,
    required this.authorName,
    required this.likesCount,
    required this.likedBy,
    required this.isShared,
    required this.visibility,
    required this.createdAtMs,
  });

  final String id;
  final String ref;
  final String body;
  final String authorId;
  final String authorName;
  final int likesCount;
  final List<String> likedBy;
  final bool isShared;
  final ThoughtVisibility visibility;
  final int createdAtMs;

  VerseThoughtData copyWith({
    int? likesCount,
    List<String>? likedBy,
    ThoughtVisibility? visibility,
  }) => VerseThoughtData(
    id: id,
    ref: ref,
    body: body,
    authorId: authorId,
    authorName: authorName,
    likesCount: likesCount ?? this.likesCount,
    likedBy: likedBy ?? this.likedBy,
    isShared: isShared,
    visibility: visibility ?? this.visibility,
    createdAtMs: createdAtMs,
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'ref': ref,
    'body': body,
    'authorId': authorId,
    'authorName': authorName,
    'likesCount': likesCount,
    'likedBy': likedBy,
    'isShared': visibility != ThoughtVisibility.private,
    'visibility': visibility.name,
    'createdAtMs': createdAtMs,
  };

  factory VerseThoughtData.fromJson(Map<String, dynamic> j) {
    final vis = _parseVisibility(
      j['visibility'],
      legacyShared: j['isShared'] as bool?,
    );
    return VerseThoughtData(
      id: j['id'] as String,
      ref: j['ref'] as String,
      body: j['body'] as String,
      authorId: j['authorId'] as String,
      authorName: (j['authorName'] ?? '') as String,
      likesCount: (j['likesCount'] ?? 0) as int,
      likedBy: ((j['likedBy'] ?? []) as List).cast<String>(),
      isShared: vis != ThoughtVisibility.private,
      visibility: vis,
      createdAtMs: (j['createdAtMs'] ?? 0) as int,
    );
  }
}

List<VerseThoughtData> readAllThoughts(SharedPreferences prefs) => _readAll(prefs);

Future<void> writeAllThoughts(
  SharedPreferences prefs,
  List<VerseThoughtData> rows,
) =>
    _writeAll(prefs, rows);

List<VerseThoughtData> _readAll(SharedPreferences prefs) {
  try {
    final raw = userPrefGetString(prefs, _thoughtsKey);
    if (raw == null || raw.isEmpty) return [];
    return (jsonDecode(raw) as List)
        .map((e) => VerseThoughtData.fromJson(e as Map<String, dynamic>))
        .toList();
  } catch (_) {
    return [];
  }
}

/// 按章倒排索引，避免 provider 每次全表扫描。
class _ThoughtsIndex {
  _ThoughtsIndex(this.all, this.byChapterPrefix, this.mine);

  final List<VerseThoughtData> all;
  final Map<String, Map<int, int>> byChapterPrefix;
  final List<VerseThoughtData> mine;
}

_ThoughtsIndex? _thoughtsIndexMem;

_ThoughtsIndex _loadThoughtsIndex(SharedPreferences prefs) {
  if (_thoughtsIndexMem != null) return _thoughtsIndexMem!;
  final all = _readAll(prefs);
  final byChapter = <String, Map<int, int>>{};
  for (final t in all) {
    final parts = t.ref.split('.');
    if (parts.length < 3) continue;
    final chapter = int.tryParse(parts[1]);
    if (chapter == null) continue;
    final prefix = '${parts[0].toUpperCase()}.$chapter.';
    final v = verseFromRef(t.ref, chapter);
    if (v == null) continue;
    final m = byChapter.putIfAbsent(prefix, () => <int, int>{});
    m[v] = (m[v] ?? 0) + 1;
  }
  final me = _meId(prefs);
  final mine = all.where((t) => t.authorId == me).toList()
    ..sort((a, b) => b.createdAtMs.compareTo(a.createdAtMs));
  _thoughtsIndexMem = _ThoughtsIndex(all, byChapter, mine);
  return _thoughtsIndexMem!;
}

void invalidateThoughtsIndexMem() => _thoughtsIndexMem = null;

String _meId(SharedPreferences prefs) =>
    prefs.getString('user_id') ??
    userPrefGetString(prefs, 'onboarding_name') ??
    'me';

Future<void> _writeAll(
  SharedPreferences prefs,
  List<VerseThoughtData> rows,
) async {
  invalidateThoughtsIndexMem();
  await userPrefSetString(
    prefs,
    _thoughtsKey,
    jsonEncode(rows.map((e) => e.toJson()).toList()),
  );
}

int? verseFromRef(String ref, int chapter) {
  final parts = ref.split('.');
  if (parts.length < 3) return null;
  if (int.tryParse(parts[1]) != chapter) return null;
  final tail = parts[2];
  if (tail.contains('-')) return int.tryParse(tail.split('-').first);
  return int.tryParse(tail);
}

final thoughtsRevisionProvider =
    NotifierProvider<ThoughtsRevisionNotifier, int>(
      ThoughtsRevisionNotifier.new,
    );

class ThoughtsRevisionNotifier extends Notifier<int> {
  @override
  int build() => 0;
  void bump() {
    invalidateThoughtsIndexMem();
    state++;
  }
}

final thoughtsByChapterProvider =
    Provider.family<Map<int, int>, ({String book, int chapter})>((ref, key) {
      ref.watch(thoughtsRevisionProvider);
      final prefs = ref.watch(prefsProvider);
      final prefix = '${key.book.toUpperCase()}.${key.chapter}.';
      return Map<int, int>.from(
        _loadThoughtsIndex(prefs).byChapterPrefix[prefix] ?? const {},
      );
    });

/// 当前用户的想法数：读经正文将「我的」想法加深为与 PWA 一致的虚线。
final myThoughtsByChapterProvider =
    Provider.family<Map<int, int>, ({String book, int chapter})>((ref, key) {
      ref.watch(thoughtsRevisionProvider);
      final prefs = ref.watch(prefsProvider);
      final me = _meId(prefs);
      final prefix = '${key.book.toUpperCase()}.${key.chapter}.';
      final map = <int, int>{};
      for (final t in _loadThoughtsIndex(prefs).mine) {
        if (t.authorId != me || !t.ref.startsWith(prefix)) continue;
        final v = verseFromRef(t.ref, key.chapter);
        if (v != null) map[v] = (map[v] ?? 0) + 1;
      }
      return map;
    });

/// 当前用户全部想法（随 revision 刷新）。
final myThoughtsProvider = Provider<List<VerseThoughtData>>((ref) {
  ref.watch(thoughtsRevisionProvider);
  final prefs = ref.watch(prefsProvider);
  return List<VerseThoughtData>.from(_loadThoughtsIndex(prefs).mine);
});

final thoughtsRepoProvider = Provider<ThoughtsRepository>(
  (ref) => ThoughtsRepository(ref.watch(prefsProvider), ref),
);

class ThoughtsRepository {
  ThoughtsRepository(this._prefs, this._ref);
  final SharedPreferences _prefs;
  final Ref _ref;

  String get _userId =>
      _prefs.getString('user_id') ??
      userPrefGetString(_prefs, 'onboarding_name') ??
      'me';

  String get _userName => userPrefGetString(_prefs, 'onboarding_name') ?? '我';

  void _notify() {
    invalidateThoughtsIndexMem();
    _ref.read(thoughtsRevisionProvider.notifier).bump();
  }

  Future<List<VerseThoughtData>> sortedForRef(String ref) async {
    final rows = _readAll(_prefs).where((t) => t.ref == ref).toList();
    final mine = rows.where((t) => t.authorId == _userId).toList()
      ..sort((a, b) => b.createdAtMs.compareTo(a.createdAtMs));
    final others = rows.where((t) => t.authorId != _userId).toList()
      ..sort((a, b) {
        final c = b.likesCount.compareTo(a.likesCount);
        if (c != 0) return c;
        return b.createdAtMs.compareTo(a.createdAtMs);
      });
    return [...mine, ...others];
  }

  /// 当前用户全部想法（新→旧），供「我的想法」页。
  List<VerseThoughtData> listMine() {
    return _readAll(_prefs).where((t) => t.authorId == _userId).toList()
      ..sort((a, b) => b.createdAtMs.compareTo(a.createdAtMs));
  }

  bool isMine(VerseThoughtData thought) => thought.authorId == _userId;

  List<VerseThoughtData> myThoughtsForRef(String ref) =>
      _readAll(_prefs).where((t) => t.ref == ref && t.authorId == _userId).toList();

  VerseThoughtData? getThoughtById(String id) {
    try {
      return _readAll(_prefs).firstWhere((t) => t.id == id && t.authorId == _userId);
    } catch (_) {
      return null;
    }
  }

  Future<bool> deleteThought(String id, {bool skipSync = false}) async {
    final rows = _readAll(_prefs);
    final i = rows.indexWhere((t) => t.id == id);
    if (i < 0 || rows[i].authorId != _userId) return false;
    final row = rows[i];
    rows.removeAt(i);
    await _writeAll(_prefs, rows);
    _notify();
    if (!skipSync) {
      final syncId = ensureThoughtSyncId(row.id);
      await enqueueThoughtSync(
        _ref,
        id: syncId,
        refStr: row.ref,
        body: row.body,
        visibility: row.visibility.name,
        createdAtMs: row.createdAtMs,
        isDelete: true,
      );
    }
    return true;
  }

  /// 删除想法后，若该经文已无自己的想法，则同步去掉划线。
  Future<bool> deleteThoughtAndClearMark(String id) async {
    final row = getThoughtById(id);
    if (!await deleteThought(id)) return false;
    if (row == null || row.ref.isEmpty || row.ref == 'FREE') return true;
    if (myThoughtsForRef(row.ref).isNotEmpty) return true;

    final markings = _ref.read(markingsRepoProvider);
    await markings.removeHighlight(row.ref);

    final parsed = parseMarkRef(row.ref);
    if (parsed?.verseStart != null) {
      final end = parsed!.verseEnd ?? parsed.verseStart!;
      for (var v = parsed.verseStart!; v <= end; v++) {
        final storage = '${parsed.bookId}.${parsed.chapter}.$v';
        if (storage != row.ref) {
          await markings.removeHighlight(storage);
        }
      }
    }
    return true;
  }

  Future<void> updateThought(
    String id,
    String body, {
    ThoughtVisibility? visibility,
    bool skipSync = false,
  }) async {
    final rows = _readAll(_prefs);
    final i = rows.indexWhere((t) => t.id == id && t.authorId == _userId);
    if (i < 0) return;
    final trimmed = body.trim();
    if (trimmed.isEmpty) return;
    final t = rows[i];
    final vis = visibility ?? t.visibility;
    final syncId = skipSync ? t.id : ensureThoughtSyncId(t.id);
    rows[i] = VerseThoughtData(
      id: syncId,
      ref: t.ref,
      body: trimmed,
      authorId: t.authorId,
      authorName: t.authorName,
      likesCount: t.likesCount,
      likedBy: t.likedBy,
      isShared: vis != ThoughtVisibility.private,
      visibility: vis,
      createdAtMs: t.createdAtMs,
    );
    await _writeAll(_prefs, rows);
    await rememberVisibility(_prefs, vis);
    _notify();
    if (!skipSync) {
      await enqueueThoughtSync(
        _ref,
        id: syncId,
        refStr: rows[i].ref,
        body: rows[i].body,
        visibility: vis.name,
        createdAtMs: rows[i].createdAtMs,
      );
    }
  }

  Future<VerseThoughtData> addThought(
    String ref,
    String body, {
    bool shared = true,
    ThoughtVisibility? visibility,
    bool skipSync = false,
    String? id,
    int? createdAtMs,
  }) async {
    final rows = _readAll(_prefs);
    final vis =
        visibility ??
        (shared ? ThoughtVisibility.public : ThoughtVisibility.private);
    final syncId = skipSync ? (id ?? ensureThoughtSyncId(null)) : ensureThoughtSyncId(id);
    final row = VerseThoughtData(
      id: syncId,
      ref: ref,
      body: body.trim(),
      authorId: _userId,
      authorName: _userName,
      likesCount: 0,
      likedBy: const [],
      isShared: vis != ThoughtVisibility.private,
      visibility: vis,
      createdAtMs: createdAtMs ?? DateTime.now().millisecondsSinceEpoch,
    );
    rows.add(row);
    await _writeAll(_prefs, rows);
    await rememberVisibility(_prefs, vis);
    _notify();
    if (!skipSync) {
      await enqueueThoughtSync(
        _ref,
        id: syncId,
        refStr: ref,
        body: row.body,
        visibility: vis.name,
        createdAtMs: row.createdAtMs,
      );
    }
    return row;
  }

  Future<void> toggleLike(VerseThoughtData thought) async {
    final rows = _readAll(_prefs);
    final i = rows.indexWhere((t) => t.id == thought.id);
    if (i < 0) return;
    final liked = [...thought.likedBy];
    if (liked.contains(_userId)) {
      liked.remove(_userId);
    } else {
      liked.add(_userId);
    }
    rows[i] = thought.copyWith(likesCount: liked.length, likedBy: liked);
    await _writeAll(_prefs, rows);
    _notify();
  }

  bool isLikedByMe(VerseThoughtData thought) =>
      thought.likedBy.contains(_userId);
}

/// 远端 pull 合并（不回写 outbox）。
Future<bool> applyRemoteThought(
  SharedPreferences prefs, {
  required String id,
  required String op,
  int? version,
  Map<String, dynamic>? data,
}) async {
  final incoming = version ?? 1;
  if (remoteVersionForThought(prefs, id) > incoming && op != 'delete') {
    return false;
  }

  if (op == 'delete') {
    final rows = readAllThoughts(prefs)..removeWhere((t) => t.id == id);
    await writeAllThoughts(prefs, rows);
    await clearThoughtSyncMeta(prefs, id);
    return true;
  }

  final refStr = (data?['ref'] as String?)?.trim();
  final body = (data?['body'] as String?)?.trim();
  if (refStr == null || refStr.isEmpty || body == null || body.isEmpty) {
    return false;
  }

  final visRaw = data?['visibility'] as String?;
  final visibility = switch (visRaw) {
    'public' => ThoughtVisibility.public,
    'friends' => ThoughtVisibility.friends,
    'private' => ThoughtVisibility.private,
    _ => ThoughtVisibility.private,
  };
  final createdAtMs = (data?['created_at_ms'] as num?)?.toInt() ??
      DateTime.now().millisecondsSinceEpoch;

  final all = readAllThoughts(prefs);
  final i = all.indexWhere((t) => t.id == id);
  if (i >= 0) {
    final prev = all[i];
    all[i] = VerseThoughtData(
      id: id,
      ref: refStr,
      body: body,
      authorId: prev.authorId,
      authorName: prev.authorName,
      likesCount: prev.likesCount,
      likedBy: prev.likedBy,
      isShared: visibility != ThoughtVisibility.private,
      visibility: visibility,
      createdAtMs: prev.createdAtMs > 0 ? prev.createdAtMs : createdAtMs,
    );
    await writeAllThoughts(prefs, all);
  } else {
    final userId =
        prefs.getString('user_id') ??
        userPrefGetString(prefs, 'onboarding_name') ??
        'me';
    final userName = userPrefGetString(prefs, 'onboarding_name') ?? '我';
    all.add(
      VerseThoughtData(
        id: id,
        ref: refStr,
        body: body,
        authorId: userId,
        authorName: userName,
        likesCount: 0,
        likedBy: const [],
        isShared: visibility != ThoughtVisibility.private,
        visibility: visibility,
        createdAtMs: createdAtMs,
      ),
    );
    await writeAllThoughts(prefs, all);
  }
  await recordRemoteThought(prefs, id, incoming);
  return true;
}
