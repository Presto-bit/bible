/// 经卷/章节总结：静态种子 + 本地缓存 + 小爱按需生成。
library;

import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../assistant/assistant_repository.dart';
import '../assistant/models.dart' as am;

const _cacheKey = 'presto_bible_summaries_v1';

const _bookSeeds = {
  'EXO': '《出埃及记》记述以色列人在埃及为奴、神借摩西施行十灾、过红海得释放，在西奈山与神立约并领受律法。全卷主题是从奴役到救赎，建立属神的百姓。',
  'GEN': '《创世记》从创造、堕落、洪水到亚伯拉罕之约，记载族长时代与约瑟下埃及，为出埃及与全本圣经的救赎历史奠基。',
};

const _chapterSeeds = {
  'EXO': {
    3: '第三章记载摩西在何烈山见燃烧未坏的荆棘，神自称「我是自有永有的」，差遣他回埃及领百姓出埃及，并赐亚伦为口。',
  },
};

Future<Map<String, String>> _readCache(SharedPreferences prefs) async {
  try {
    final raw = prefs.getString(_cacheKey);
    if (raw == null) return {};
    return Map<String, String>.from(jsonDecode(raw) as Map);
  } catch (_) {
    return {};
  }
}

Future<void> _writeCache(SharedPreferences prefs, Map<String, String> map) async {
  await prefs.setString(_cacheKey, jsonEncode(map));
}

String _bookKey(String bookId) => 'book:${bookId.toUpperCase()}';
String _chapterKey(String bookId, int ch) => 'ch:${bookId.toUpperCase()}.$ch';

Future<String> _streamAsk(
  WidgetRef ref, {
  required String question,
  String? refStr,
}) async {
  final buf = StringBuffer();
  await for (final evt in ref.read(assistantRepoProvider).chat(
        ref: refStr,
        question: question,
        mode: am.AssistantMode.explain,
      )) {
    switch (evt) {
      case am.DeltaEvent(:final text):
        buf.write(text);
      case am.ErrorEvent(:final message):
        if (buf.isEmpty) throw Exception(message);
      default:
        break;
    }
  }
  return buf.toString().replaceAll(RegExp(r'\n?\s*【相关追问】[\s\S]*'), '').trim();
}

Future<String> loadBookSummary(
  WidgetRef ref,
  SharedPreferences prefs,
  String bookId,
  String bookName,
) async {
  final map = await _readCache(prefs);
  final key = _bookKey(bookId);
  if (map.containsKey(key)) return map[key]!;

  final seed = _bookSeeds[bookId.toUpperCase()];
  if (seed != null) {
    map[key] = seed;
    await _writeCache(prefs, map);
    return seed;
  }

  final body = await _streamAsk(ref,
      question:
          '请用150-200字简体中文概括《$bookName》整卷的主旨、结构与核心主题，适合读经前导读，通顺自然，不要分条编号。',
      refStr: bookId);
  map[key] = body;
  await _writeCache(prefs, map);
  return body;
}

Future<String> loadChapterSummary(
  WidgetRef ref,
  SharedPreferences prefs,
  String bookId,
  String bookName,
  int chapter,
) async {
  final map = await _readCache(prefs);
  final key = _chapterKey(bookId, chapter);
  if (map.containsKey(key)) return map[key]!;

  final seed = _chapterSeeds[bookId.toUpperCase()]?[chapter];
  if (seed != null) {
    map[key] = seed;
    await _writeCache(prefs, map);
    return seed;
  }

  final body = await _streamAsk(ref,
      question:
          '请用80-120字简体中文概括《$bookName》第$chapter章的核心内容与要点，适合读经前导读，通顺自然，不要分条编号。',
      refStr: '$bookId.$chapter');
  map[key] = body;
  await _writeCache(prefs, map);
  return body;
}
