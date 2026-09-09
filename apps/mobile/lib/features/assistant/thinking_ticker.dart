/// 思考行单行文案（对齐 Web `thinking_ticker.ts`）。
library;

import 'assistant_thinking.dart';

String buildThinkingLabel({
  required ThinkingPhase phase,
  int citeCount = 0,
  String? currentSectionTitle,
  ThinkingVariant variant = ThinkingVariant.defaultTab,
}) {
  final half = variant == ThinkingVariant.halfSheet;

  switch (phase) {
    case ThinkingPhase.understanding:
      return half ? '正在阅读这节经文…' : '正在理解你的问题…';
    case ThinkingPhase.refs:
      if (citeCount > 0) {
        return '已找到 $citeCount 条释经资料，正在组织回答…';
      }
      return '正在检索释经资料…';
    case ThinkingPhase.writing:
      if (currentSectionTitle != null && currentSectionTitle.trim().isNotEmpty) {
        return '正在写「$currentSectionTitle」…';
      }
      return half ? '正在整理解读…' : '正在组织回答…';
  }
}
