/// 章节 prefs 缓存：读快显、写去重异步。
library;

import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'models.dart';

const chapterCachePrefix = 'presto_ch_cnv_';

final _writtenHashes = <String, String>{};

String _cacheKey(String book, int chapter, {String? versionId}) =>
    versionId == null
        ? '$chapterCachePrefix${book}_$chapter'
        : '$chapterCachePrefix${book}_${chapter}_$versionId';

Chapter? readChapterCache(
  SharedPreferences prefs,
  String book,
  int chapter, {
  String? versionId,
}) {
  final raw = prefs.getString(_cacheKey(book, chapter, versionId: versionId));
  if (raw == null) return null;
  try {
    final j = jsonDecode(raw) as Map<String, dynamic>;
    final ts = j['ts'] as int? ?? 0;
    if (DateTime.now().millisecondsSinceEpoch - ts > 7 * 86400000) {
      return null;
    }
    return Chapter.fromJson(j['data'] as Map<String, dynamic>);
  } catch (_) {
    return null;
  }
}

String _chapterFingerprint(Chapter ch) =>
    '${ch.bookId}|${ch.chapter}|${ch.verses.length}|'
    '${ch.verses.map((v) => '${v.verse}:${v.text.length}').join(';')}';

void writeChapterCache(
  SharedPreferences prefs,
  String book,
  int chapter,
  Chapter ch, {
  String? versionId,
}) {
  final key = _cacheKey(book, chapter, versionId: versionId);
  final fp = _chapterFingerprint(ch);
  if (_writtenHashes[key] == fp) return;
  _writtenHashes[key] = fp;
  final payload = jsonEncode({
    'ts': DateTime.now().millisecondsSinceEpoch,
    'data': {
      'book': ch.bookId,
      'name': ch.bookName,
      'chapter': ch.chapter,
      'verses': ch.verses
          .map((v) => {'verse': v.verse, 'text': v.text})
          .toList(),
    },
  });
  // SharedPreferences 写盘放 microtask，避免 postFrame 卡 UI 线程。
  Future<void>.microtask(() => prefs.setString(key, payload));
}
