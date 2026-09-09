/// 流式阶段未写入小节占位（对齐 PWA `AnswerSectionSkeleton.tsx`）。
library;

import 'package:flutter/material.dart';

import '../../core/theme.dart';
import 'assistant_sections.dart';

class AnswerSectionSkeleton extends StatelessWidget {
  const AnswerSectionSkeleton({
    super.key,
    required this.sections,
    required this.writtenSectionIds,
  });

  final List<AnswerSection> sections;
  final Set<String> writtenSectionIds;

  @override
  Widget build(BuildContext context) {
    final pending = sections.where((s) => !writtenSectionIds.contains(s.id));
    if (pending.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final sec in pending) ...[
          _ShimmerLine(widthFactor: 1),
          const SizedBox(height: 8),
          const _ShimmerLine(widthFactor: 0.72),
          const SizedBox(height: 14),
        ],
      ],
    );
  }
}

class _ShimmerLine extends StatelessWidget {
  const _ShimmerLine({required this.widthFactor});

  final double widthFactor;

  @override
  Widget build(BuildContext context) {
    return FractionallySizedBox(
      widthFactor: widthFactor,
      alignment: Alignment.centerLeft,
      child: Container(
        height: 10,
        decoration: BoxDecoration(
          color: AppColors.line.withValues(alpha: 0.55),
          borderRadius: BorderRadius.circular(6),
        ),
      ),
    );
  }
}
