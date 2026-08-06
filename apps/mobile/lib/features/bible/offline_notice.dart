/// 离线经库内联提示 + 顶栏离线状态。
/// 对齐 PWA OfflineBar：仅 **真离线** 时提示，不因单次 API 失败误报；
/// 读经沉浸隐藏；下载入口仅离线库未装时出现。
library;

import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/app_shell.dart' show navIndexProvider, readerImmersiveProvider;
import '../../core/api_client.dart';
import '../../core/theme.dart';
import 'offline_bible.dart';
import 'offline_download_sheet.dart';

const _offlineCardDismissKey = 'offline_bible_card_dismissed_v1';

/// 设备层联网探测（对齐 PWA `navigator.onLine`，不依赖 /health 是否存在）。
Future<bool> _deviceOnline() async {
  if (kIsWeb) return true;
  try {
    final result = await InternetAddress.lookup('dns.alidns.com')
        .timeout(const Duration(seconds: 3));
    if (result.isNotEmpty && result.first.rawAddress.isNotEmpty) return true;
  } catch (_) {}
  try {
    final result = await InternetAddress.lookup('1.1.1.1')
        .timeout(const Duration(seconds: 2));
    if (result.isNotEmpty && result.first.rawAddress.isNotEmpty) return true;
  } catch (_) {}
  return false;
}

/// 连续两次失败才判离线，避免弱网抖动误报。
final networkOkProvider = StreamProvider<bool>((ref) async* {
  var failStreak = 0;
  var last = true;
  Future<bool> probe() async {
    final ok = await _deviceOnline();
    if (ok) {
      failStreak = 0;
      last = true;
      return true;
    }
    failStreak++;
    if (failStreak >= 2) {
      last = false;
      return false;
    }
    // 保留上一次在线态，避免闪离线
    return last;
  }

  yield await probe();
  await for (final _ in Stream.periodic(const Duration(seconds: 20))) {
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

final offlineCardDismissedProvider =
    NotifierProvider<OfflineCardDismissed, bool>(OfflineCardDismissed.new);

/// 阅读器内「未装经库」提示：仅联网且未装时出现，引导下载（可关闭）。
class OfflineBibleCard extends ConsumerWidget {
  const OfflineBibleCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final online =
        ref.watch(networkOkProvider).maybeWhen(data: (ok) => ok, orElse: () => true);
    final installed = ref.watch(offlineInstalledProvider);
    final dismissed = ref.watch(offlineCardDismissedProvider);
    // 在线已可从网络读经 → 不挡阅读；只在用户可能需要离线时提示
    if (!online || dismissed) return const SizedBox.shrink();
    return installed.when(
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
      data: (ready) {
        if (ready) return const SizedBox.shrink();
        return Container(
          width: double.infinity,
          margin: const EdgeInsets.fromLTRB(16, 8, 16, 0),
          padding: const EdgeInsets.fromLTRB(12, 10, 4, 10),
          decoration: BoxDecoration(
            color: AppColors.goldWash.withValues(alpha: 0.55),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.line),
          ),
          child: Row(
            children: [
              const Expanded(
                child: Text(
                  '建议下载和合本经库，断网时仍可读经。',
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

/// 对齐 PWA OfflineBar：仅真离线；读经沉浸时隐藏；下载仅未装经库。
class OfflineStatusBar extends ConsumerWidget {
  const OfflineStatusBar({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final net = ref.watch(networkOkProvider);
    final installed = ref.watch(offlineInstalledProvider);
    final immersive = ref.watch(readerImmersiveProvider);
    final tab = ref.watch(navIndexProvider);
    // 读经沉浸不顶层（对齐 PWA body.reader-immersive .offline-bar）
    if (immersive && tab == 1) return const SizedBox.shrink();

    final online = net.maybeWhen(data: (ok) => ok, orElse: () => true);
    if (online) return const SizedBox.shrink();

    final packReady =
        installed.maybeWhen(data: (r) => r, orElse: () => false);
    final packLabel = packReady
        ? '离线经库已就绪 · 小爱与消息需联网'
        : '离线经库未安装 · 可下载和合本后断网读经';

    return Material(
      color: AppColors.paper,
      child: DecoratedBox(
        decoration: BoxDecoration(
          border: Border(
            bottom: BorderSide(color: AppColors.line.withValues(alpha: 0.9)),
          ),
          color: AppColors.goldWash.withValues(alpha: 0.55),
        ),
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
                    child: const Text('下载经库', style: TextStyle(fontSize: 12)),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
