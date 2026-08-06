/// 离线经库内联提示 + 顶栏弱网/离线状态（对齐 PWA OfflineBar：仅离线时提示）。
library;

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/theme.dart';
import 'offline_bible.dart';
import 'offline_download_sheet.dart';

const _offlineCardDismissKey = 'offline_bible_card_dismissed_v1';

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

class OfflineCardDismissed extends Notifier<bool> {
  @override
  bool build() =>
      ref.watch(prefsProvider).getBool(_offlineCardDismissKey) ?? false;

  void dismiss() {
    ref.read(prefsProvider).setBool(_offlineCardDismissKey, true);
    state = true;
  }

  void clear() {
    ref.read(prefsProvider).remove(_offlineCardDismissKey);
    state = false;
  }
}

/// 阅读器内「未装经库」卡片是否已关闭（持久）。
final offlineCardDismissedProvider =
    NotifierProvider<OfflineCardDismissed, bool>(OfflineCardDismissed.new);

class OfflineBibleCard extends ConsumerWidget {
  const OfflineBibleCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final installed = ref.watch(offlineInstalledProvider);
    final dismissed = ref.watch(offlineCardDismissedProvider);
    return installed.when(
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
      data: (ready) {
        if (ready || dismissed) return const SizedBox.shrink();
        return Container(
          width: double.infinity,
          margin: const EdgeInsets.fromLTRB(16, 8, 16, 0),
          padding: const EdgeInsets.fromLTRB(12, 10, 4, 10),
          decoration: BoxDecoration(
            color: AppColors.goldWash,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.line),
          ),
          child: Row(
            children: [
              const Expanded(
                child: Text(
                  '离线阅读需先下载经库。设置或「我的 · 常用」可下载。',
                  style: TextStyle(fontSize: 13, color: AppColors.inkSoft),
                ),
              ),
              TextButton(
                onPressed: () => showOfflineDownloadSheet(context, ref),
                child: const Text('下载'),
              ),
              IconButton(
                tooltip: '关闭',
                visualDensity: VisualDensity.compact,
                icon: const Icon(Icons.close, size: 18, color: AppColors.inkFaint),
                onPressed: () {
                  ref.read(offlineCardDismissedProvider.notifier).dismiss();
                },
              ),
            ],
          ),
        );
      },
    );
  }
}

/// 对齐 PWA OfflineBar：仅在离线时浮出；在线不打扰。
class OfflineStatusBar extends ConsumerWidget {
  const OfflineStatusBar({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final net = ref.watch(networkOkProvider);
    final installed = ref.watch(offlineInstalledProvider);
    final online = net.maybeWhen(data: (ok) => ok, orElse: () => true);
    if (online) return const SizedBox.shrink();

    final packReady =
        installed.maybeWhen(data: (r) => r, orElse: () => false);
    final packLabel = packReady
        ? '离线经库已就绪 · 小爱与消息需联网'
        : '圣经与笔记可用 · 未装经库时离线无法读经';

    return Material(
      color: AppColors.goldWash,
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text(
                      '当前离线 · 圣经与笔记可用',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: AppColors.ink,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      packLabel,
                      style: const TextStyle(
                        fontSize: 11,
                        color: AppColors.inkSoft,
                      ),
                    ),
                  ],
                ),
              ),
              if (!packReady)
                TextButton(
                  onPressed: () => showOfflineDownloadSheet(context, ref),
                  child: const Text('下载', style: TextStyle(fontSize: 12)),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
