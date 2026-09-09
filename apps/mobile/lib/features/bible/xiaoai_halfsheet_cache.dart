/// 读经半屏小爱：同 ref + 选区 + 问句 缓存 LLM 回答（内存 + SharedPreferences，按自然日刷新）。
library;

import 'dart:async';
import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../../core/daily_clock.dart';
import '../assistant/assistant_format.dart';
import '../assistant/assistant_scenes.dart';
import '../assistant/models.dart';

const _storageKey = 'presto_xiaoai_halfsheet_v1';
const _maxEntries = 48;

class HalfSheetCacheEntry {
  HalfSheetCacheEntry({
    required this.answer,
    required this.citations,
    required this.day,
    required this.savedAt,
  });

  final String answer;
  final List<Citation> citations;
  final String day;
  final int savedAt;
}

final _cache = <String, HalfSheetCacheEntry>{};
var _prefsLoaded = false;

String _buildKey(
  AssistantScene scene,
  String ref,
  String selection,
  String question, [
  String? knowledgeBaseId,
]) =>
    '${scene.id}\u001e${ref.trim().toUpperCase()}\u001e${selection.trim()}\u001e${question.trim()}\u001e${(knowledgeBaseId ?? '').trim()}';

Future<void> initHalfSheetCache() async {
  if (_prefsLoaded) return;
  try {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_storageKey);
    if (raw != null && raw.isNotEmpty) {
      final decoded = jsonDecode(raw);
      if (decoded is Map) {
        for (final entry in decoded.entries) {
          final v = entry.value;
          if (v is! Map) continue;
          final answer = (v['answer'] ?? '') as String;
          if (answer.trim().isEmpty) continue;
          final citesRaw = v['citations'];
          final citations = citesRaw is List
              ? citesRaw
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
                  .toList()
              : const <Citation>[];
          _cache[entry.key] = HalfSheetCacheEntry(
            answer: answer,
            citations: citations,
            day: (v['day'] ?? '') as String,
            savedAt: (v['savedAt'] ?? 0) as int,
          );
        }
      }
    }
  } catch (_) {
    /* fail-open */
  }
  _prefsLoaded = true;
}

Future<void> _persistHalfSheetCache() async {
  try {
    final prefs = await SharedPreferences.getInstance();
    final sorted = _cache.entries.toList()
      ..sort((a, b) => b.value.savedAt.compareTo(a.value.savedAt));
    final trimmed = Map.fromEntries(sorted.take(_maxEntries));
    final payload = <String, dynamic>{};
    for (final e in trimmed.entries) {
      payload[e.key] = {
        'answer': e.value.answer,
        'citations': e.value.citations
            .map((c) => {
                  'n': c.n,
                  'title': c.title,
                  if (c.snippet != null) 'snippet': c.snippet,
                })
            .toList(),
        'day': e.value.day,
        'savedAt': e.value.savedAt,
      };
    }
    await prefs.setString(_storageKey, jsonEncode(payload));
  } catch (_) {
    /* fail-open */
  }
}

({String answer, List<Citation> citations})? readHalfSheetCache(
  AssistantScene scene,
  String ref,
  String selection,
  String question, {
  String? knowledgeBaseId,
}) {
  final verseSpan = verseSpanFromRef(ref);
  final key = _buildKey(scene, ref, selection, question, knowledgeBaseId);
  final entry = _cache[key];
  if (entry == null || entry.answer.trim().isEmpty) return null;
  if (entry.day != chinaTodayYmd()) {
    _cache.remove(key);
    unawaited(_persistHalfSheetCache());
    return null;
  }
  if (!isHalfSheetAnswerComplete(entry.answer, scene, verseSpan)) {
    _cache.remove(key);
    unawaited(_persistHalfSheetCache());
    return null;
  }
  return (answer: entry.answer, citations: entry.citations);
}

void writeHalfSheetCache(
  AssistantScene scene,
  String ref,
  String selection,
  String question,
  String answer,
  List<Citation> citations, {
  String? knowledgeBaseId,
}) {
  final text = answer.trim();
  if (text.isEmpty || text.startsWith('⚠️')) return;
  if (!isHalfSheetAnswerComplete(text, scene, verseSpanFromRef(ref))) return;
  final key = _buildKey(scene, ref, selection, question, knowledgeBaseId);
  _cache[key] = HalfSheetCacheEntry(
    answer: text,
    citations: citations,
    day: chinaTodayYmd(),
    savedAt: DateTime.now().millisecondsSinceEpoch,
  );
  if (_cache.length > _maxEntries) {
    final sorted = _cache.entries.toList()
      ..sort((a, b) => b.value.savedAt.compareTo(a.value.savedAt));
    _cache
      ..clear()
      ..addEntries(sorted.take(_maxEntries));
  }
  unawaited(_persistHalfSheetCache());
}

bool _refMatchesPrefix(String ref, String prefix) {
  final r = ref.trim().toUpperCase();
  final p = prefix.trim().toUpperCase();
  if (r.isEmpty || p.isEmpty) return false;
  return r == p || r.startsWith('$p.');
}

/// 按 ref 前缀清理半屏小爱缓存（如 JHN.13 整章）。
int clearHalfSheetCacheForRefPrefix(String refPrefix) {
  final keys = _cache.keys
      .where((key) {
        final parts = key.split('\u001e');
        final ref = parts.length > 1 ? parts[1] : '';
        return _refMatchesPrefix(ref, refPrefix);
      })
      .toList(growable: false);
  for (final key in keys) {
    _cache.remove(key);
  }
  if (keys.isNotEmpty) unawaited(_persistHalfSheetCache());
  return keys.length;
}
