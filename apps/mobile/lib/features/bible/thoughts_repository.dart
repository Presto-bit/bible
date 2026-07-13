/// 经文想法：本地 JSON 存储 + 点赞 + 共享展示。
library;

import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';

import '../../core/api_client.dart';
import '../../core/user_storage.dart';

const _thoughtsKey = 'verse_thoughts_v1';

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
  final int createdAtMs;

  VerseThoughtData copyWith({
    int? likesCount,
    List<String>? likedBy,
  }) =>
      VerseThoughtData(
        id: id,
        ref: ref,
        body: body,
        authorId: authorId,
        authorName: authorName,
        likesCount: likesCount ?? this.likesCount,
        likedBy: likedBy ?? this.likedBy,
        isShared: isShared,
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
        'isShared': isShared,
        'createdAtMs': createdAtMs,
      };

  factory VerseThoughtData.fromJson(Map<String, dynamic> j) => VerseThoughtData(
        id: j['id'] as String,
        ref: j['ref'] as String,
        body: j['body'] as String,
        authorId: j['authorId'] as String,
        authorName: (j['authorName'] ?? '') as String,
        likesCount: (j['likesCount'] ?? 0) as int,
        likedBy: ((j['likedBy'] ?? []) as List).cast<String>(),
        isShared: (j['isShared'] ?? true) as bool,
        createdAtMs: (j['createdAtMs'] ?? 0) as int,
      );
}

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

Future<void> _writeAll(
    SharedPreferences prefs, List<VerseThoughtData> rows) async {
  await userPrefSetString(prefs, _thoughtsKey, jsonEncode(rows.map((e) => e.toJson()).toList()));
}

String selectionRef(String bookId, int chapter, List<int> verses) {
  final sel = [...verses]..sort();
  if (sel.isEmpty) return '$bookId.$chapter';
  if (sel.first == sel.last) return '$bookId.$chapter.${sel.first}';
  return '$bookId.$chapter.${sel.first}-${sel.last}';
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
    NotifierProvider<ThoughtsRevisionNotifier, int>(ThoughtsRevisionNotifier.new);

class ThoughtsRevisionNotifier extends Notifier<int> {
  @override
  int build() => 0;
  void bump() => state++;
}

final thoughtsByChapterProvider =
    Provider.family<Map<int, int>, ({String book, int chapter})>((ref, key) {
  ref.watch(thoughtsRevisionProvider);
  final prefs = ref.watch(prefsProvider);
  final prefix = '${key.book.toUpperCase()}.${key.chapter}.';
  final map = <int, int>{};
  for (final t in _readAll(prefs)) {
    if (!t.ref.startsWith(prefix)) continue;
    final v = verseFromRef(t.ref, key.chapter);
    if (v != null) map[v] = (map[v] ?? 0) + 1;
  }
  return map;
});

final thoughtsRepoProvider = Provider<ThoughtsRepository>(
  (ref) => ThoughtsRepository(ref.watch(prefsProvider), ref),
);

class ThoughtsRepository {
  ThoughtsRepository(this._prefs, this._ref);
  final SharedPreferences _prefs;
  final Ref _ref;
  static const _uuid = Uuid();

  String get _userId =>
      _prefs.getString('user_id') ??
      userPrefGetString(_prefs, 'onboarding_name') ??
      'me';

  String get _userName => userPrefGetString(_prefs, 'onboarding_name') ?? '我';

  void _notify() => _ref.read(thoughtsRevisionProvider.notifier).bump();

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

  Future<VerseThoughtData> addThought(String ref, String body,
      {bool shared = true}) async {
    final rows = _readAll(_prefs);
    final row = VerseThoughtData(
      id: _uuid.v4(),
      ref: ref,
      body: body.trim(),
      authorId: _userId,
      authorName: _userName,
      likesCount: 0,
      likedBy: const [],
      isShared: shared,
      createdAtMs: DateTime.now().millisecondsSinceEpoch,
    );
    rows.add(row);
    await _writeAll(_prefs, rows);
    _notify();
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
