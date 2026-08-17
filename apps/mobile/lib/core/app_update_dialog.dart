/// 官网 APK 更新弹窗：下载任务归应用，弹窗可随时关闭并从设置重新打开。
library;

import 'package:flutter/material.dart';

import 'app_update.dart';
import 'widgets/peiai_overlays.dart';

Future<void> showAppUpdateDialog({
  required BuildContext context,
  required AppUpdate update,
  String? currentVersionName,
}) {
  return showDialog<void>(
    context: context,
    barrierDismissible: true,
    builder: (dialogContext) => AppUpdateDownloadDialog(
      update: update,
      currentVersionName: currentVersionName,
    ),
  );
}

class AppUpdateDownloadDialog extends StatefulWidget {
  const AppUpdateDownloadDialog({
    super.key,
    required this.update,
    this.currentVersionName,
  });

  final AppUpdate update;
  final String? currentVersionName;

  @override
  State<AppUpdateDownloadDialog> createState() =>
      _AppUpdateDownloadDialogState();
}

class _AppUpdateDownloadDialogState extends State<AppUpdateDownloadDialog> {
  @override
  Widget build(BuildContext context) {
    final current = widget.currentVersionName?.trim();
    return ValueListenableBuilder<AppUpdateDownloadState>(
      valueListenable: AppUpdateService.downloadState,
      builder: (context, task, _) {
        final active = task.update?.versionCode == widget.update.versionCode
            ? task
            : const AppUpdateDownloadState();
        final phase = active.phase;
        final busy = active.isBusy;
        final progress = active.progress;
        final String body = switch (phase) {
          AppUpdateDownloadPhase.downloading =>
            progress <= 0
                ? '正在准备下载。你可关闭此窗口，稍后从「更新彼爱 App」查看进度。'
                : '正在下载 ${(progress * 100).round()}%。你可关闭此窗口，稍后再回来查看。',
          AppUpdateDownloadPhase.prompting => '下载完成，正在打开系统安装界面…',
          AppUpdateDownloadPhase.ready => '若未出现系统安装提示，可点「重新打开安装」。',
          AppUpdateDownloadPhase.failed => active.error ?? '更新失败，请稍后重试。',
          AppUpdateDownloadPhase.idle =>
            current == null || current.isEmpty
                ? '彼爱 ${widget.update.versionName} 已准备好。'
                : '当前 $current，可更新至 ${widget.update.versionName}。',
        };
        return PeiaiDialog(
          title: Text(
            phase == AppUpdateDownloadPhase.ready ? '可以安装新版本' : '发现新版本',
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(body),
              if (phase == AppUpdateDownloadPhase.downloading) ...[
                const SizedBox(height: 18),
                LinearProgressIndicator(value: progress <= 0 ? null : progress),
                const SizedBox(height: 6),
                Text(progress <= 0 ? '准备中…' : '${(progress * 100).round()}%'),
              ],
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: Text(busy ? '后台下载' : '关闭'),
            ),
            if (phase == AppUpdateDownloadPhase.idle ||
                phase == AppUpdateDownloadPhase.failed)
              FilledButton(
                onPressed: () =>
                    AppUpdateService().startDownload(widget.update),
                child: Text(
                  phase == AppUpdateDownloadPhase.failed ? '重试' : '立即更新',
                ),
              ),
            if (phase == AppUpdateDownloadPhase.ready)
              FilledButton(
                onPressed: () =>
                    AppUpdateService().promptInstall(widget.update),
                child: const Text('重新打开安装'),
              ),
          ],
        );
      },
    );
  }
}
