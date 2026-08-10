/// 小爱流式等待态：骨架线 + 分阶段文案（与 PWA AssistantThinkingState 对齐）。
library;

import 'package:flutter/material.dart';

import '../../core/theme.dart';

enum ThinkingPhase {
  understanding,
  refs,
  writing,
}

/// 小爱等待首包输出时的占位（骨架 + 分阶段文案）。
class AssistantThinkingState extends StatefulWidget {
  const AssistantThinkingState({
    super.key,
    required this.phase,
    this.citeCount = 0,
    this.slow = false,
  });

  final ThinkingPhase phase;
  final int citeCount;
  final bool slow;

  @override
  State<AssistantThinkingState> createState() => _AssistantThinkingStateState();
}

class _AssistantThinkingStateState extends State<AssistantThinkingState>
    with SingleTickerProviderStateMixin {
  late final AnimationController _shimmer;

  @override
  void initState() {
    super.initState();
    _shimmer = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    )..repeat();
  }

  @override
  void dispose() {
    _shimmer.dispose();
    super.dispose();
  }

  String get _label {
    switch (widget.phase) {
      case ThinkingPhase.understanding:
        return '正在理解你的问题…';
      case ThinkingPhase.refs:
        if (widget.citeCount > 0) {
          return '已找到 ${widget.citeCount} 条释经资料，正在组织回答…';
        }
        return '资料库暂无直接对应注释，正在组织回答…';
      case ThinkingPhase.writing:
        return '正在组织回答…';
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        AnimatedBuilder(
          animation: _shimmer,
          builder: (_, __) {
            final t = _shimmer.value;
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _SkeletonLine(progress: t, widthFactor: 1),
                const SizedBox(height: 8),
                _SkeletonLine(progress: t, widthFactor: 0.72),
                const SizedBox(height: 8),
                _SkeletonLine(progress: t, widthFactor: 0.88),
              ],
            );
          },
        ),
        const SizedBox(height: 10),
        Text(
          _label,
          style: const TextStyle(
            fontSize: 13,
            height: 1.4,
            color: AppColors.inkFaint,
          ),
        ),
        if (widget.slow) ...[
          const SizedBox(height: 6),
          const Text(
            '网络较慢，可稍候或点「停止」后重试',
            style: TextStyle(
              fontSize: 12,
              height: 1.35,
              color: AppColors.inkFaint,
            ),
          ),
        ],
      ],
    );
  }
}

class _SkeletonLine extends StatelessWidget {
  const _SkeletonLine({required this.progress, required this.widthFactor});
  final double progress;
  final double widthFactor;

  @override
  Widget build(BuildContext context) {
    return FractionallySizedBox(
      alignment: Alignment.centerLeft,
      widthFactor: widthFactor,
      child: Container(
        height: 10,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(6),
          gradient: LinearGradient(
            begin: Alignment(-1.0 + 2 * progress, 0),
            end: Alignment(1.0 + 2 * progress, 0),
            colors: [
              AppColors.line.withValues(alpha: 0.55),
              AppColors.surfaceSunken.withValues(alpha: 0.95),
              AppColors.line.withValues(alpha: 0.55),
            ],
          ),
        ),
      ),
    );
  }
}
