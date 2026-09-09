/// 小爱等待首包：单行灰色过程提示（对齐 PWA `ThinkingLine.tsx`）。
library;

import 'package:flutter/material.dart';

import '../../core/theme.dart';

enum ThinkingPhase {
  understanding,
  refs,
  writing,
}

class AssistantThinkingState extends StatelessWidget {
  const AssistantThinkingState({
    super.key,
    required this.phase,
    this.citeCount = 0,
    this.slow = false,
    this.variant = ThinkingVariant.defaultTab,
  });

  final ThinkingPhase phase;
  final int citeCount;
  final bool slow;
  final ThinkingVariant variant;

  String get _label {
    switch (phase) {
      case ThinkingPhase.understanding:
        return variant == ThinkingVariant.halfSheet
            ? '正在阅读这节经文…'
            : '正在理解你的问题…';
      case ThinkingPhase.refs:
        if (citeCount > 0) {
          return '已找到 $citeCount 条释经资料，正在组织回答…';
        }
        return '资料库暂无直接对应注释，正在组织回答…';
      case ThinkingPhase.writing:
        return variant == ThinkingVariant.halfSheet
            ? '正在整理解读…'
            : '正在组织回答…';
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          _label,
          style: const TextStyle(
            color: AppColors.inkFaint,
            fontSize: 12,
            height: 1.45,
          ),
        ),
        if (slow)
          const Padding(
            padding: EdgeInsets.only(top: 6),
            child: Text(
              '网络较慢，可稍候或点「停止」后重试',
              style: TextStyle(color: AppColors.inkFaint, fontSize: 12),
            ),
          ),
      ],
    );
  }
}

enum ThinkingVariant { defaultTab, halfSheet }
