/// 竖轴时间线（对齐 PWA `TimelineRail.tsx`）。
library;

import 'package:flutter/material.dart';

import '../../core/theme.dart';
import 'assistant_blocks.dart';

class TimelineRail extends StatelessWidget {
  const TimelineRail({
    super.key,
    required this.nodes,
    this.preset = false,
  });

  final List<TimelineNode> nodes;
  final bool preset;

  @override
  Widget build(BuildContext context) {
    if (nodes.isEmpty) return const SizedBox.shrink();
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: preset
          ? const EdgeInsets.fromLTRB(26, 10, 12, 6)
          : const EdgeInsets.only(left: 14),
      decoration: preset
          ? BoxDecoration(
              color: Color.lerp(AppColors.surface, AppColors.wash, 0.35) ??
                  AppColors.surface,
              borderRadius: BorderRadius.circular(12),
            )
          : null,
      child: Column(
        children: [
          for (var i = 0; i < nodes.length; i++)
            _TimelineItem(
              node: nodes[i],
              isLast: i == nodes.length - 1,
            ),
        ],
      ),
    );
  }
}

class _TimelineItem extends StatelessWidget {
  const _TimelineItem({required this.node, required this.isLast});

  final TimelineNode node;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 18,
            child: Column(
              children: [
                Container(
                  width: 8,
                  height: 8,
                  margin: const EdgeInsets.only(top: 6),
                  decoration: BoxDecoration(
                    color: AppColors.accentDeep,
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(
                        color: AppColors.accentWash.withValues(alpha: 0.7),
                        blurRadius: 0,
                        spreadRadius: 3,
                      ),
                    ],
                  ),
                ),
                if (!isLast)
                  Expanded(
                    child: Container(
                      width: 2,
                      margin: const EdgeInsets.symmetric(vertical: 2),
                      color: Color.lerp(AppColors.line, AppColors.accentDeep, 0.35),
                    ),
                  ),
              ],
            ),
          ),
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(bottom: isLast ? 0 : 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    node.year,
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: AppColors.accentDeep,
                    ),
                  ),
                  if (node.label.isNotEmpty && node.label != node.year)
                    Text(
                      node.label,
                      style: const TextStyle(
                        fontSize: 15,
                        height: 1.72,
                        color: AppColors.ink,
                      ),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
