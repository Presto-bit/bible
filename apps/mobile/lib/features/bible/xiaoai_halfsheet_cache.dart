/// 读经半屏小爱：同 ref + 选区 + 问句 缓存 LLM 回答（进程内，按自然日刷新）。
library;

import '../../core/daily_clock.dart';
import '../assistant/assistant_format.dart';
import '../assistant/assistant_scenes.dart';
import '../assistant/models.dart';

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

String _buildKey(
  AssistantScene scene,
  String ref,
  String selection,
  String question,
) =>
    '${scene.id}\u001e${ref.trim().toUpperCase()}\u001e${selection.trim()}\u001e${question.trim()}';

({String answer, List<Citation> citations})? readHalfSheetCache(
  AssistantScene scene,
  String ref,
  String selection,
  String question,
) {
  final key = _buildKey(scene, ref, selection, question);
  final entry = _cache[key];
  if (entry == null || entry.answer.trim().isEmpty) return null;
  if (entry.day != chinaTodayYmd()) {
    _cache.remove(key);
    return null;
  }
  if (!isHalfSheetAnswerComplete(entry.answer, scene)) {
    _cache.remove(key);
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
  List<Citation> citations,
) {
  final text = answer.trim();
  if (text.isEmpty || text.startsWith('⚠️')) return;
  if (!isHalfSheetAnswerComplete(text, scene)) return;
  final key = _buildKey(scene, ref, selection, question);
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
}

bool _refMatchesPrefix(String ref, String prefix) {
  final r = ref.trim().toUpperCase();
  final p = prefix.trim().toUpperCase();
  if (r.isEmpty || p.isEmpty) return false;
  return r == p || r.startsWith('$p.');
}

/// 按 ref 前缀清理半屏小爱进程内缓存（如 JHN.13 整章）。
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
  return keys.length;
}
