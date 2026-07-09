/// 云同步状态指示（对标 Web SyncStatusBadge）。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../sync/sync_controller.dart';
import '../theme.dart';

class SyncStatusBadge extends ConsumerWidget {
  const SyncStatusBadge({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(syncControllerProvider);
    final label = switch (state.kind) {
      SyncUiStateKind.syncing => '同步中',
      SyncUiStateKind.offline => '离线',
      SyncUiStateKind.error => '同步异常',
      SyncUiStateKind.idle =>
        state.pending > 0 ? '待同步' : '已同步',
    };
    final dotColor = switch (state.kind) {
      SyncUiStateKind.syncing => AppColors.accentDeep,
      SyncUiStateKind.offline => AppColors.inkFaint,
      SyncUiStateKind.error => const Color(0xFFB1554A),
      SyncUiStateKind.idle =>
        state.pending > 0 ? const Color(0xFFC9A227) : AppColors.accentDeep,
    };

    return InkWell(
      onTap: state.kind == SyncUiStateKind.syncing
          ? null
          : () async {
              if (state.kind == SyncUiStateKind.offline) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('当前离线，联网后将自动同步'),
                    duration: Duration(seconds: 2),
                  ),
                );
                return;
              }
              final messenger = ScaffoldMessenger.of(context);
              messenger.showSnackBar(
                const SnackBar(
                  content: Text('正在同步…'),
                  duration: Duration(seconds: 1),
                ),
              );
              await ref.read(syncControllerProvider.notifier).runSync(force: true);
              if (!context.mounted) return;
              final s = ref.read(syncControllerProvider);
              final msg = s.kind == SyncUiStateKind.idle
                  ? (s.lastSyncAt != null
                      ? '同步完成 · ${TimeOfDay.fromDateTime(s.lastSyncAt!).format(context)}'
                      : '同步完成')
                  : (s.error ?? '同步失败');
              messenger.showSnackBar(
                SnackBar(content: Text(msg), duration: const Duration(seconds: 2)),
              );
            },
      borderRadius: BorderRadius.circular(20),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: AppColors.paper,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: AppColors.line),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 7,
              height: 7,
              decoration: BoxDecoration(color: dotColor, shape: BoxShape.circle),
            ),
            const SizedBox(width: 6),
            Text(label, style: const TextStyle(fontSize: 11, color: AppColors.inkSoft)),
            if (state.pending > 0 && state.kind != SyncUiStateKind.offline) ...[
              Text(
                '（${state.pending}）',
                style: const TextStyle(fontSize: 10, color: AppColors.inkFaint),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
