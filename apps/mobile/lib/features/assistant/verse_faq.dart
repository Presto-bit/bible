/// 端侧经包 FAQ：弱网/离线秒答默认「请解读/请解释」问句。
library;

import 'dart:async' show unawaited;
import 'dart:convert';

import 'package:flutter/services.dart';

import 'assistant_scenes.dart';

const _assetPath = 'assets/verse_faq/explain.json';

/// 与 `data/verse_faq/explain.json` 的 schema 字段对齐。
const verseFaqBundleVersion = 'verse_faq_explain@1';

final _deepQ = RegExp(
  r'分别|详细|深入|全面|完整|整段|脉络|逐节|每一节|背景.*应用|应用.*背景|从背景|历史背景|上下文|结构',
);

Map<String, String>? _answers;
Future<void>? _loadFuture;

Future<void> _ensureLoaded() async {
  if (_answers != null) return;
  _loadFuture ??= _loadBundle();
  await _loadFuture;
}

Future<void> _loadBundle() async {
  try {
    final raw = await rootBundle.loadString(_assetPath);
    final j = jsonDecode(raw) as Map<String, dynamic>;
    if (j['schema'] != verseFaqBundleVersion) {
      _answers = const {};
      return;
    }
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

/// 进入读经/小爱时预拉经包。
void preloadVerseFaq() {
  unawaited(_ensureLoaded());
}

String normalizeVerseFaqRef(String ref) => ref.trim().toUpperCase();

bool wantsExpandedAnswer(String question) {
  final q = question.trim();
  return q.isNotEmpty && _deepQ.hasMatch(q);
}

bool isDefaultExplainQuestion(String question) {
  final q = question.trim();
  if (q.contains('「')) return false;
  return q.startsWith('请解读：') ||
      q.startsWith('请解读:') ||
      q.startsWith('请解释：') ||
      q.startsWith('请解释:');
}

bool isDefaultHalfSheetExplain(
  String question,
  bool explicitSelection,
  AssistantScene scene,
) {
  if (explicitSelection) return false;
  if (scene != AssistantScene.verseQuick && scene != AssistantScene.verseFull) {
    return false;
  }
  return isDefaultExplainQuestion(question);
}

bool isDefaultTabExplain({
  required String question,
  required int historyLength,
  required AssistantScene scene,
  required bool hasRef,
}) {
  if (!hasRef || historyLength > 0) return false;
  if (scene != AssistantScene.verseQuick &&
      scene != AssistantScene.chatExplain &&
      scene != AssistantScene.verseFull) {
    return false;
  }
  return isDefaultExplainQuestion(question);
}

Future<String?> readVerseFaqExplain(String ref) async {
  await _ensureLoaded();
  return _answers![normalizeVerseFaqRef(ref)];
}

String? readVerseFaqExplainSync(String ref) {
  return _answers?[normalizeVerseFaqRef(ref)];
}
