/// 端侧经包 FAQ：弱网/离线秒答默认「请解读」问句。
library;

import 'dart:convert';

import 'package:flutter/services.dart';

import 'assistant_scenes.dart';

const _assetPath = 'assets/verse_faq/explain.json';

Map<String, String>? _answers;

Future<void> _ensureLoaded() async {
  if (_answers != null) return;
  try {
    final raw = await rootBundle.loadString(_assetPath);
    final j = jsonDecode(raw) as Map<String, dynamic>;
    final verses = (j['verses'] as Map?)?.cast<String, dynamic>() ?? const {};
    _answers = {
      for (final e in verses.entries)
        normalizeVerseFaqRef(e.key): ((e.value as Map?)?['answer'] ?? '')
            .toString()
            .trim(),
    }..removeWhere((_, v) => v.isEmpty);
  } catch (_) {
    _answers = const {};
  }
}

String normalizeVerseFaqRef(String ref) => ref.trim().toUpperCase();

bool isDefaultHalfSheetExplain(
  String question,
  bool explicitSelection,
  AssistantScene scene,
) {
  if (explicitSelection) return false;
  if (scene != AssistantScene.verseQuick) return false;
  final q = question.trim();
  return q.startsWith('请解读：') && !q.contains('「');
}

Future<String?> readVerseFaqExplain(String ref) async {
  await _ensureLoaded();
  return _answers![normalizeVerseFaqRef(ref)];
}
