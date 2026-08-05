/// 离线经库内联提示 + 顶栏弱网/离线状态（诚实降级）。
library;

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/theme.dart';
import 'offline_bible.dart';
import 'offline_download_sheet.dart';

/// 周期性轻量探测 API；失败时显示弱网条。
final networkOkProvider = StreamProvider<bool>((ref) async* {
  final dio = ref.watch(dioProvider);
  Future<bool> probe() async {
    try {
      await dio.get(
        '/health',
        options: Options(
          receiveTimeout: const Duration(seconds: 4),
          sendTimeout: const Duration(seconds: 4),
        ),
      );
      return true;
    } catch (_) {
      return false;
    }
  }

  yield await probe();
  await for (final _ in Stream.periodic(const Duration(seconds: 45))) {
    yield await probe();
  }
});

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
                  '离线阅读需先下载经库。我的 → 离线 / 设置 → 离线圣经',
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
    final net = ref.watch(networkOkProvider);
    final installed = ref.watch(offlineInstalledProvider);
    final offlinePack = installed.maybeWhen(data: (r) => r, orElse: () => true);
    final online = net.maybeWhen(data: (ok) => ok, orElse: () => true);

    if (online && offlinePack) return const SizedBox.shrink();

    String msg;
    if (!online && !offlinePack) {
      msg = '当前离线，且未下载经库 · 消息与同步将稍后重试';
    } else if (!online) {
      msg = '网络不可用 · 已发消息可能未送达，联网后自动重试';
    } else {
      msg = '未下载离线经库 · 弱网时可能无法阅读';
    }

    return Material(
      color: AppColors.goldWash,
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
          child: Text(
            msg,
            style: const TextStyle(fontSize: 12, color: AppColors.inkSoft),
          ),
        ),
      ),
    );
  }
}
