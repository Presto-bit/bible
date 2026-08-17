/// 彼爱共享弹层：低对比、圆角纸感，与 PWA half-sheet / toast 对齐。
library;

import 'package:flutter/material.dart';

import '../../app/app_shell.dart' show peiaiTabContentBottomPad;

/// 用于确认或输入前说明的轻量对话框。
class PeiaiDialog extends StatelessWidget {
  const PeiaiDialog({
    super.key,
    required this.title,
    required this.content,
    required this.actions,
  });

  final Widget title;
  final Widget content;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Dialog(
      insetPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 24),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 20, 16, 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            DefaultTextStyle.merge(
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w700,
              ),
              child: title,
            ),
            const SizedBox(height: 12),
            DefaultTextStyle.merge(
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurface.withValues(alpha: 0.72),
              ),
              child: content,
            ),
            const SizedBox(height: 12),
            Align(
              alignment: Alignment.centerRight,
              child: Wrap(spacing: 6, children: actions),
            ),
          ],
        ),
      ),
    );
  }
}

/// 标准底部 sheet 容器。正文由调用者提供，保留系统拖拽关闭行为。
class PeiaiSheet extends StatelessWidget {
  const PeiaiSheet({
    super.key,
    this.title,
    required this.child,
    this.padding = const EdgeInsets.fromLTRB(16, 8, 16, 20),
  });

  final String? title;
  final Widget child;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SafeArea(
      top: false,
      child: Padding(
        padding: padding,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 36,
                height: 4,
                margin: const EdgeInsets.only(bottom: 12),
                decoration: BoxDecoration(
                  color: theme.dividerColor,
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            ),
            if (title != null) ...[
              Text(
                title!,
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 12),
            ],
            child,
          ],
        ),
      ),
    );
  }
}

/// 短暂、不会遮挡阅读的胶囊提示。
void showPeiaiToast(BuildContext context, String message) {
  final theme = Theme.of(context);
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        behavior: SnackBarBehavior.floating,
        elevation: 0,
        backgroundColor: theme.colorScheme.onSurface.withValues(alpha: 0.82),
        shape: const StadiumBorder(),
        margin: EdgeInsets.fromLTRB(
          24,
          0,
          24,
          peiaiTabContentBottomPad(context) + 8,
        ),
        content: Text(
          message,
          textAlign: TextAlign.center,
          style: TextStyle(color: theme.colorScheme.surface),
        ),
      ),
    );
}
