/// H5 → Flutter 原生通道（读经锚点去小爱等）。
library;

import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../app/app_shell.dart';
import '../features/assistant/assistant_seed.dart';
import 'app_update.dart';

const kPeiaiJsChannel = 'PeiaiFlutter';

/// 发现 Tab WebView 导航目标（子路径深链 / open_path）。
class DiscoverH5PathNotifier extends Notifier<String?> {
  @override
  String? build() => null;
  void go(String path) => state = path;
  void consume() => state = null;
}

final discoverH5PathProvider =
    NotifierProvider<DiscoverH5PathNotifier, String?>(
        DiscoverH5PathNotifier.new);

/// 注册 JS Channel；消息 JSON：`{ "type": "open_assistant", "ref": "…", "q": "…" }`
void attachPeiaiJsChannel(
  WebViewController controller, {
  required WidgetRef ref,
  required BuildContext context,
  Future<bool> Function()? onGoBack,
}) {
  controller.addJavaScriptChannel(
    kPeiaiJsChannel,
    onMessageReceived: (msg) {
      try {
        final data = jsonDecode(msg.message);
        if (data is! Map) return;
        final type = '${data['type'] ?? ''}';
        if (type == 'open_assistant') {
          final r = '${data['ref'] ?? ''}'.trim();
          final q = '${data['q'] ?? data['question'] ?? ''}'.trim();
          if (!context.mounted) return;
          // 切 Tab + seed，避免再 push 一层小爱路由叠栈
          ref.read(assistantSeedProvider.notifier).open(
                ref: r.isEmpty ? null : r,
                question: q.isEmpty ? null : q,
              );
          ref.read(navIndexProvider.notifier).set(2);
        } else if (type == 'open_reader') {
          final book = '${data['book'] ?? ''}'.trim();
          final ch = '${data['chapter'] ?? ''}'.trim();
          final loc = Uri(
            path: '/reader',
            queryParameters: {
              if (book.isNotEmpty) 'book': book,
              if (ch.isNotEmpty) 'chapter': ch,
            },
          ).toString();
          if (!context.mounted) return;
          ref.read(navIndexProvider.notifier).set(1);
          Future.microtask(() {
            if (context.mounted) context.push(loc);
          });
        } else if (type == 'check_app_update') {
          Future.microtask(() async {
            final status = await const AppUpdateService().status();
            if (!context.mounted) return;
            if (status.checkFailed) {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('暂时无法检查新版本，请稍后再试')),
              );
              return;
            }
            final update = status.update;
            if (update == null) {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  content: Text('彼爱 ${status.currentVersionName} 已是最新版本'),
                ),
              );
              return;
            }
            await showDialog<void>(
              context: context,
              builder: (dialogContext) {
                var downloading = false;
                var progress = 0.0;
                return StatefulBuilder(
                  builder: (_, setDialogState) => AlertDialog(
                    title: const Text('发现新版本'),
                    content: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '当前 ${status.currentVersionName}，可更新至 ${update.versionName}。',
                        ),
                        if (downloading) ...[
                          const SizedBox(height: 18),
                          LinearProgressIndicator(
                            value: progress == 0 ? null : progress,
                          ),
                        ],
                      ],
                    ),
                    actions: [
                      if (!downloading)
                        TextButton(
                          onPressed: () => Navigator.of(dialogContext).pop(),
                          child: const Text('以后再说'),
                        ),
                      FilledButton(
                        onPressed: downloading
                            ? null
                            : () async {
                                setDialogState(() => downloading = true);
                                try {
                                  await const AppUpdateService()
                                      .downloadAndPromptInstall(
                                        update,
                                        onProgress: (value) {
                                          if (dialogContext.mounted) {
                                            setDialogState(
                                              () => progress = value,
                                            );
                                          }
                                        },
                                      );
                                  if (dialogContext.mounted) {
                                    Navigator.of(dialogContext).pop();
                                  }
                                } catch (_) {
                                  if (!dialogContext.mounted) return;
                                  setDialogState(() => downloading = false);
                                  ScaffoldMessenger.of(
                                    dialogContext,
                                  ).showSnackBar(
                                    const SnackBar(
                                      content: Text('新版本下载失败，请稍后重试'),
                                    ),
                                  );
                                }
                              },
                        child: const Text('立即更新'),
                      ),
                    ],
                  ),
                );
              },
            );
          });
        } else if (type == 'close_h5') {
          if (context.mounted && context.canPop()) context.pop();
        } else if (type == 'go_back') {
          // IM 内页：关半屏 → Web 历史 → 再 pop 壳
          Future.microtask(() async {
            if (onGoBack != null) {
              final empty = await onGoBack();
              if (empty && context.mounted && context.canPop()) {
                context.pop();
              }
              return;
            }
            if (await controller.canGoBack()) {
              await controller.goBack();
            } else if (context.mounted && context.canPop()) {
              context.pop();
            }
          });
        } else if (type == 'open_path') {
          final path = '${data['path'] ?? ''}'.trim();
          if (path.isEmpty || !context.mounted) return;
          if (path.startsWith('/reader')) {
            ref.read(navIndexProvider.notifier).set(1);
          } else if (path.startsWith('/assistant')) {
            ref.read(navIndexProvider.notifier).set(2);
            final uri = Uri.tryParse(path);
            if (uri != null) {
              ref.read(assistantSeedProvider.notifier).open(
                    ref: uri.queryParameters['ref'],
                    question: uri.queryParameters['q'] ??
                        uri.queryParameters['question'],
                  );
            }
            return;
          } else if (path.startsWith('/discover')) {
            ref.read(navIndexProvider.notifier).set(3);
            ref.read(discoverH5PathProvider.notifier).go(path);
            return;
          }
          Future.microtask(() {
            if (context.mounted) context.push(path);
          });
        } else if (type == 'path_changed' || type == 'h5_path') {
          // SPA 路由：发现私聊/群聊 → 壳隐藏底栏（勿走 discoverH5Path，避免整页重载）
          final path = '${data['path'] ?? ''}'.trim();
          if (path.isEmpty) return;
          syncDiscoverChromeFromPath(ref, path);
        }
      } catch (e) {
        if (kDebugMode) debugPrint('PeiaiFlutter channel: $e');
      }
    },
  );
}
