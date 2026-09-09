/// 小爱等待首包：单行灰色过程提示（对齐 PWA `ThinkingLine.tsx`）。
library;

import 'package:flutter/material.dart';

import '../../core/theme.dart';
import 'thinking_ticker.dart';

enum ThinkingPhase {
  understanding,
  refs,
  writing,
}

enum ThinkingVariant { defaultTab, halfSheet }

class AssistantThinkingState extends StatelessWidget {
  const AssistantThinkingState({
    super.key,
    required this.phase,
    this.citeCount = 0,
    this.slow = false,
    this.variant = ThinkingVariant.defaultTab,
    this.currentSectionTitle,
  });

  final ThinkingPhase phase;
  final int citeCount;
  final bool slow;
  final ThinkingVariant variant;
  final String? currentSectionTitle;

  @override
  Widget build(BuildContext context) {
    final label = buildThinkingLabel(
      phase: phase,
      citeCount: citeCount,
      currentSectionTitle: currentSectionTitle,
      variant: variant,
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          label,
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
