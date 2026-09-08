/// 经卷/章节总结：静态种子 + 本地缓存 + 小爱按需生成。
library;

import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../assistant/assistant_format.dart';
import '../assistant/assistant_repository.dart';
import '../assistant/assistant_scenes.dart';
import '../assistant/models.dart' as am;
import 'bible_repository.dart';

const _cacheKey = 'presto_bible_summaries_v2';

/// 长章（>20 节）走结构导读 scene
const longChapterVerseThreshold = 21;

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

bool looksTruncated(String text, {required bool isBook}) {
  final t = text.trim();
  if (t.isEmpty) return true;
  if (RegExp(r'[…⋯]$|\.\.\.$').hasMatch(t)) return true;
  if (t.contains('生成未完成')) return true;
  final hasOverview = RegExp(r'(?:^|\n)###\s*(?:本章概览|卷概览)').hasMatch(t);
  final hasBody = RegExp(r'(?:^|\n)###\s*(?:核心内容|分段要点|结构脉络)').hasMatch(t);
  final listItems = RegExp(r'^\s*[-*•]\s+\S', multiLine: true).allMatches(t).length;
  if (isBook) {
    if (t.length < 24 && !RegExp(r'[。！？]').hasMatch(t)) return true;
    if (!hasOverview || !hasBody) return true;
    return t.length < 120;
  }
  if (t.length < 8) return true;
  if (!hasOverview || !hasBody) return true;
  if (t.contains('分段要点')) {
    return listItems < 3 || t.length < 80;
  }
  return listItems < 2 || t.length < 40;
}

Future<int> _chapterVerseCount(WidgetRef ref, String bookId, int chapter) async {
  try {
    final ch = await ref.read(bibleRepoProvider).chapter(bookId, chapter);
    return ch.verses.length;
  } catch (_) {
    return 0;
  }
}

Future<String> _streamAsk(
  WidgetRef ref, {
  required String question,
  String? refStr,
  required AssistantScene scene,
}) async {
  final buf = StringBuffer();
  var streamOk = true;
  await for (final evt in ref.read(assistantRepoProvider).chat(
        ref: refStr,
        question: question,
        mode: am.AssistantMode.explain,
        scene: scene,
      )) {
    switch (evt) {
      case am.DeltaEvent(:final text):
        buf.write(text);
      case am.DoneEvent(:final streamComplete):
        if (!streamComplete) streamOk = false;
      case am.ErrorEvent(:final message):
        if (buf.isEmpty) throw Exception(message);
      default:
        break;
    }
  }
  final body = bodyText(buf.toString()).trim();
  if (body.isEmpty) {
    throw Exception('小爱暂时没有生成内容，请稍后重试');
  }
  if (!streamOk) {
    throw Exception('导读未完整送达，请重试');
  }
  return body;
}

Future<String> loadBookSummary(
  WidgetRef ref,
  SharedPreferences prefs,
  String bookId,
  String bookName,
) async {
  final map = await _readCache(prefs);
  final key = _bookKey(bookId);
  final cached = map[key];
  if (cached != null && !looksTruncated(cached, isBook: true)) return cached;

  final seed = _bookSeeds[bookId.toUpperCase()];
  if (seed != null) {
    map[key] = seed;
    await _writeCache(prefs, map);
    return seed;
  }

  final body = await _streamAsk(
    ref,
    question:
        '请为《$bookName》写整卷导读：卷概览、结构脉络（分段而非逐章）、核心主题与读经提示。不要逐章概述。务必写完整，不要中途截断。',
    refStr: bookId,
    scene: AssistantScene.summaryBook,
  );
  if (!looksTruncated(body, isBook: true)) {
    map[key] = body;
    await _writeCache(prefs, map);
  }
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
  final cached = map[key];
  if (cached != null && !looksTruncated(cached, isBook: false)) return cached;

  final seed = _chapterSeeds[bookId.toUpperCase()]?[chapter];
  if (seed != null) {
    map[key] = seed;
    await _writeCache(prefs, map);
    return seed;
  }

  final verseCount = await _chapterVerseCount(ref, bookId, chapter);
  final useOutline = verseCount >= longChapterVerseThreshold;
  final scene =
      useOutline ? AssistantScene.summaryChapterOutline : AssistantScene.summaryChapter;
  final body = await _streamAsk(
    ref,
    question: useOutline
        ? '请为《$bookName》第$chapter章写结构导读：本章概览、分段要点（3–5 段，不要逐节罗列）与读经提示。务必写完整，不要中途截断。'
        : '请概括《$bookName》第$chapter章的核心内容与要点（本章概览 + 核心内容列表）。务必写完整，不要中途截断。',
    refStr: '$bookId.$chapter',
    scene: scene,
  );
  if (!looksTruncated(body, isBook: false)) {
    map[key] = body;
    await _writeCache(prefs, map);
  }
  return body;
}
