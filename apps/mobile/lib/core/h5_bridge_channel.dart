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
import '../features/bible/offline_download_sheet.dart';
import 'app_update.dart';
import 'app_update_dialog.dart';
import 'campaign_nav.dart';
import 'notifications.dart';
import 'app_theme.dart';

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
      DiscoverH5PathNotifier.new,
    );

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
          ref
              .read(assistantSeedProvider.notifier)
              .open(ref: r.isEmpty ? null : r, question: q.isEmpty ? null : q);
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
            final task = AppUpdateService.downloadState.value;
            if (task.update != null &&
                task.phase != AppUpdateDownloadPhase.idle) {
              if (!context.mounted) return;
              await showAppUpdateDialog(context: context, update: task.update!);
              return;
            }
            final status = await const AppUpdateService().status();
            if (!context.mounted) return;
            if (status.checkFailed) {
              ScaffoldMessenger.of(
                context,
              ).showSnackBar(const SnackBar(content: Text('暂时无法检查新版本，请稍后再试')));
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
            await showAppUpdateDialog(
              context: context,
              update: update,
              currentVersionName: status.currentVersionName,
            );
          });
        } else if (type == 'open_external') {
          final url = '${data['url'] ?? ''}'.trim();
          if (url.isEmpty || !context.mounted) return;
          final title = '${data['title'] ?? ''}'.trim();
          Future.microtask(() {
            if (!context.mounted) return;
            openCampaignHref(context, url, title: title.isEmpty ? null : title);
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
              ref
                  .read(assistantSeedProvider.notifier)
                  .open(
                    ref: uri.queryParameters['ref'],
                    question:
                        uri.queryParameters['q'] ??
                        uri.queryParameters['question'],
                  );
            }
            return;
          } else           if (path.startsWith('/discover')) {
            ref.read(navIndexProvider.notifier).set(3);
            ref.read(discoverH5PathProvider.notifier).go(path);
            Future.microtask(() {
              if (!context.mounted) return;
              // 叠层 H5 内 open_path：回主壳，由发现 Tab WebView 消费路径
              if (context.canPop()) context.go('/');
            });
            return;
          }
          if (path.startsWith('/shelf')) {
            Future.microtask(() {
              if (context.mounted) context.push(path);
            });
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
        } else if (type == 'request_notifications') {
          Future.microtask(() async {
            await NotificationService.instance.requestPermission();
          });
        } else if (type == 'show_im_notification') {
          final title = '${data['title'] ?? '彼爱'}'.trim();
          final body = '${data['body'] ?? ''}'.trim();
          final path = '${data['path'] ?? data['openPath'] ?? '/discover'}'
              .trim();
          final tag = '${data['tag'] ?? ''}'.trim();
          if (body.isEmpty) return;
          Future.microtask(() async {
            await NotificationService.instance.showImDigest(
              title: title,
              body: body,
              payload: path,
              tag: tag,
            );
          });
        } else if (type == 'schedule_reminder') {
          final kind = '${data['kind'] ?? 'daily'}'.trim();
          final enabledRaw = data['enabled'];
          final enabled =
              enabledRaw == true ||
              enabledRaw == 1 ||
              '$enabledRaw' == '1' ||
              '$enabledRaw'.toLowerCase() == 'true';
          Future.microtask(() async {
            if (!enabled) {
              await NotificationService.instance.cancelReminder(kind);
              return;
            }
            await NotificationService.instance.requestPermission();
            final hour = int.tryParse('${data['hour'] ?? ''}') ?? 8;
            final minute = int.tryParse('${data['minute'] ?? ''}') ?? 0;
            await NotificationService.instance.scheduleReminder(
              kind: kind == 'group' ? 'group' : 'daily',
              hour: hour,
              minute: minute,
              title: '${data['title'] ?? ''}',
              body: '${data['body'] ?? ''}',
              payload: '${data['path'] ?? data['openPath'] ?? ''}',
            );
          });
        } else if (type == 'cancel_reminder') {
          final kind = '${data['kind'] ?? 'daily'}'.trim();
          Future.microtask(() async {
            await NotificationService.instance.cancelReminder(kind);
          });
        } else if (type == 'set_theme') {
          final raw = '${data['theme'] ?? data['app_theme'] ?? ''}'.trim();
          if (raw.isEmpty || !context.mounted) return;
          final id = AppThemeId.values.firstWhere(
            (e) => e.storageKey == raw,
            orElse: () => AppThemeId.classic,
          );
          Future.microtask(() async {
            await ref.read(appThemeProvider.notifier).set(id);
          });
        } else if (type == 'open_offline_download') {
          if (!context.mounted) return;
          Future.microtask(() {
            if (!context.mounted) return;
            showOfflineDownloadSheet(context, ref);
          });
        }
      } catch (e) {
        if (kDebugMode) debugPrint('PeiaiFlutter channel: $e');
      }
    },
  );
}
