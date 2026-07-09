/// 离线经库内联提示 + 顶栏离线状态。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme.dart';
import 'offline_bible.dart';
import 'offline_download_sheet.dart';

class OfflineBibleCard extends ConsumerWidget {
  const OfflineBibleCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final installed = ref.watch(offlineInstalledProvider);
    return installed.when(
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
      data: (ready) {
        if (ready) return const SizedBox.shrink();
        return Container(
          width: double.infinity,
          margin: const EdgeInsets.fromLTRB(16, 8, 16, 0),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: AppColors.goldWash,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.line),
          ),
          child: Row(
            children: [
              const Expanded(
                child: Text(
                  '离线阅读需先下载经库。我的 → 设置 → 离线圣经',
                  style: TextStyle(fontSize: 13, color: AppColors.inkSoft),
                ),
              ),
              TextButton(
                onPressed: () => showOfflineDownloadSheet(context, ref),
                child: const Text('下载'),
              ),
            ],
          ),
        );
      },
    );
  }
}

class OfflineStatusBar extends ConsumerWidget {
  const OfflineStatusBar({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
  // 简化：仅在未安装时提示（完整网络检测可后续接 connectivity_plus）
    final installed = ref.watch(offlineInstalledProvider);
    return installed.maybeWhen(
      data: (ready) => ready
          ? const SizedBox.shrink()
          : Material(
              color: AppColors.goldWash,
              child: SafeArea(
                bottom: false,
                child: Padding(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                  child: Text(
                    '未下载离线经库 · 弱网时可能无法阅读',
                    style: const TextStyle(fontSize: 12, color: AppColors.inkSoft),
                  ),
                ),
              ),
            ),
      orElse: () => const SizedBox.shrink(),
    );
  }
}
