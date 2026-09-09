/// 思考行轮播文案（对齐 Web `thinking_ticker.ts`）。
library;

import 'assistant_thinking.dart';

List<String> buildThinkingMessages({
  required ThinkingPhase phase,
  int citeCount = 0,
  String? currentSectionTitle,
  ThinkingVariant variant = ThinkingVariant.defaultTab,
}) {
  final half = variant == ThinkingVariant.halfSheet;

  switch (phase) {
    case ThinkingPhase.understanding:
      if (half) {
        return const [
          '正在阅读这节经文…',
          '正在理解你的问题…',
          '正在准备释经检索…',
        ];
      }
      return const [
        '正在理解你的问题…',
        '正在结合锚定经节…',
        '正在准备释经检索…',
      ];
    case ThinkingPhase.refs:
      if (citeCount > 0) {
        return [
          '正在检索释经资料…',
          '已找到 $citeCount 条相关资料…',
          '正在筛选与经节最相关的注释…',
        ];
      }
      return const [
        '正在检索释经资料…',
        '资料库暂无直接对应注释…',
        '正在组织回答…',
      ];
    case ThinkingPhase.writing:
      final base = half
          ? const ['正在整理解读…', '正在组织回答…', '正在整理结构与脚注…']
          : const ['正在组织回答…', '正在整理结构与脚注…', '正在核对引用格式…'];
      if (currentSectionTitle != null && currentSectionTitle.trim().isNotEmpty) {
        return ['正在写「$currentSectionTitle」…', ...base];
      }
      return base;
  }
}
