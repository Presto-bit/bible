/// 首次将本机阅读/成就数据并入账号。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../sync/sync_controller.dart';
import '../sync/sync_migrate.dart';
import '../theme.dart';
import '../api_client.dart' show prefsProvider;
import '../../features/notes/notes_repository.dart' show dbProvider;

class SyncMigrateSheet extends ConsumerStatefulWidget {
  const SyncMigrateSheet({super.key, required this.onDone});

  final VoidCallback onDone;

  @override
  ConsumerState<SyncMigrateSheet> createState() => _SyncMigrateSheetState();
}

class _SyncMigrateSheetState extends ConsumerState<SyncMigrateSheet> {
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    final prefs = ref.watch(prefsProvider);
    final db = ref.watch(dbProvider);
  return FutureBuilder<bool>(
      future: hasLocalReadingDataAsync(prefs, db),
      builder: (context, snap) {
        final hasData = snap.data ?? false;
        return AlertDialog(
          title: const Text('同步阅读记录'),
          content: Text(
            hasData
                ? '检测到本机有阅读打卡、章节记录或成就。合并到账号后，手机与电脑将显示一致的连续天数与进度。'
                : '开启云同步后，阅读打卡与成就会在多设备间保持一致。',
            style: const TextStyle(fontSize: 14, color: AppColors.inkSoft, height: 1.5),
          ),
          actions: [
            if (hasData)
              FilledButton(
                onPressed: _busy
                    ? null
                    : () async {
                        setState(() => _busy = true);
                        try {
                          await ref
                              .read(syncControllerProvider.notifier)
                              .runMigrationAndSync();
                        } finally {
                          if (mounted) {
                            setState(() => _busy = false);
                            widget.onDone();
                          }
                        }
                      },
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.accentDeep,
                ),
                child: Text(_busy ? '合并中…' : '合并到账号'),
              )
            else
              FilledButton(
                onPressed: _busy
                    ? null
                    : () {
                        markSyncMigrated(prefs);
                        widget.onDone();
                        ref.read(syncControllerProvider.notifier).scheduleSync();
                      },
                child: const Text('知道了'),
              ),
            TextButton(
              onPressed: _busy
                  ? null
                  : () {
                      if (hasData) markSyncMigrated(prefs);
                      widget.onDone();
                      ref.read(syncControllerProvider.notifier).scheduleSync();
                    },
              child: Text(hasData ? '暂不合并' : '关闭'),
            ),
          ],
        );
      },
    );
  }
}

Future<void> maybeShowSyncMigrateSheet(BuildContext context, WidgetRef ref) async {
  final needs = await ref.read(needsMigrateProvider.future);
  if (!needs || !context.mounted) return;
  await showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (_) => SyncMigrateSheet(
      onDone: () => Navigator.of(context).pop(),
    ),
  );
}
