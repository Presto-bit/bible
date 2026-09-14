/// 章节 prefs 缓存：读快显、写去重异步。
library;

import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'bible_book_names.dart';
import 'models.dart';

const chapterCachePrefix = 'presto_ch_cnv_';

final _writtenHashes = <String, String>{};

String _cacheKey(String book, int chapter, {String? versionId}) =>
    versionId == null
        ? '$chapterCachePrefix${book}_$chapter'
        : '$chapterCachePrefix${book}_${chapter}_$versionId';

bool _looksLikeCjkChapter(Chapter ch) {
  if (ch.verses.isEmpty) return false;
  final sample = ch.verses.take(3).map((v) => v.text).join();
  if (sample.isEmpty) return false;
  var cjk = 0;
  for (final r in sample.runes) {
    if (r >= 0x4e00 && r <= 0x9fff) cjk++;
  }
  return cjk >= 4;
}

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
    final storedVersion = (j['versionId'] as String?)?.trim();
    final want = (versionId ?? 'cuvs').trim().toLowerCase();
    if (storedVersion != null &&
        storedVersion.isNotEmpty &&
        storedVersion.toLowerCase() != want) {
      return null;
    }
    final ch = Chapter.fromJson(j['data'] as Map<String, dynamic>);
    // 旧缓存可能把和合本误写入 NIV/KJV 键：英文译本若正文像中文则丢弃
    if (isEnglishBibleVersion(want) && _looksLikeCjkChapter(ch)) {
      return null;
    }
    return ch;
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
  // 禁止把中文章节写入英文译本缓存键
  final want = (versionId ?? 'cuvs').trim().toLowerCase();
  if (isEnglishBibleVersion(want) && _looksLikeCjkChapter(ch)) {
    return;
  }
  _writtenHashes[key] = fp;
  final payload = jsonEncode({
    'ts': DateTime.now().millisecondsSinceEpoch,
    'versionId': want,
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
