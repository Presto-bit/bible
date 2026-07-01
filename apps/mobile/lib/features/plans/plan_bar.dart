/// 计划阅读顶栏：今日计划 + 段进度。
library;

import 'package:flutter/material.dart';

import '../../core/theme.dart';
import 'plan_session.dart';
import 'plan_steps.dart';

class PlanReadingBar extends StatelessWidget {
  const PlanReadingBar({
    super.key,
    required this.planTitle,
    required this.day,
    required this.totalDays,
    required this.steps,
    required this.session,
    required this.onJumpStep,
    required this.onOpenSheet,
  });

  final String planTitle;
  final int day;
  final int totalDays;
  final List<PlanStep> steps;
  final PlanSession session;
  final void Function(int index) onJumpStep;
  final VoidCallback onOpenSheet;

  @override
  Widget build(BuildContext context) {
    final prog = sessionProgress(steps, session.stepsDone);
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: AppColors.accentWash,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.line),
      ),
      child: Column(
        children: [
          InkWell(
            onTap: onOpenSheet,
            borderRadius: BorderRadius.circular(12),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      '📅 $planTitle · 第 $day/$totalDays 天',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: AppColors.accentDeep,
                      ),
                    ),
                  ),
                  Text('${prog.done}/${prog.total} 段',
                      style: const TextStyle(
                          fontSize: 11, color: AppColors.inkSoft)),
                  const Icon(Icons.chevron_right,
                      size: 18, color: AppColors.inkFaint),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

void showPlanDaySheet(
  BuildContext context, {
  required int day,
  required List<PlanStep> steps,
  required PlanSession session,
  required int currentStepIndex,
  required void Function(int index) onJump,
}) {
  showModalBottomSheet<void>(
    context: context,
    backgroundColor: AppColors.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (ctx) {
      final prog = sessionProgress(steps, session.stepsDone);
      return Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text('今日安排 · 第 $day 天',
                    style: const TextStyle(
                        fontWeight: FontWeight.w700, fontSize: 16)),
                const Spacer(),
                IconButton(
                  icon: const Icon(Icons.close, color: AppColors.inkFaint),
                  onPressed: () => Navigator.pop(ctx),
                ),
              ],
            ),
            Text('${prog.done}/${prog.total} 段已完成',
                style: const TextStyle(fontSize: 12, color: AppColors.inkFaint)),
            const SizedBox(height: 12),
            ...steps.asMap().entries.map((e) {
              final i = e.key;
              final s = e.value;
              final done = session.stepsDone.contains(s.id);
              final active = i == currentStepIndex;
              return ListTile(
                contentPadding: EdgeInsets.zero,
                leading: CircleAvatar(
                  radius: 14,
                  backgroundColor:
                      done ? AppColors.accentDeep : AppColors.accentWash,
                  child: done
                      ? const Icon(Icons.check, color: Colors.white, size: 14)
                      : Text('${i + 1}',
                          style: const TextStyle(
                              fontSize: 11, color: AppColors.accentDeep)),
                ),
                title: Text(s.label,
                    style: TextStyle(
                        fontWeight: active ? FontWeight.w700 : FontWeight.w500)),
                trailing: Text(active ? '当前' : '去读 ›',
                    style: const TextStyle(
                        fontSize: 12, color: AppColors.inkFaint)),
                onTap: () {
                  Navigator.pop(ctx);
                  onJump(i);
                },
              );
            }),
          ],
        ),
      );
    },
  );
}
