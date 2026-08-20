/// 创世记 50：Flutter 鉴权 + Chrome Custom Tabs（避免 System WebView 空白）。
library;

import 'dart:async' show unawaited;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'genesis50_auth.dart';
import 'theme.dart';

const _channel = MethodChannel('cn.prestoai.peiai/app_update');

String? genesis50TargetFromBridge(String href) {
  if (!isGenesis50BridgeHref(href)) return null;
  try {
    final u = Uri.parse(normalizeGenesis50Href(href));
    final target = (u.queryParameters['href'] ?? u.queryParameters['target'] ?? '')
        .trim();
    if (target.isEmpty || !isGenesis50Href(target)) return null;
    return normalizeGenesis50Href(target);
  } catch (_) {
    return null;
  }
}

String resolveGenesis50RawTarget(String href) {
  final fromBridge = genesis50TargetFromBridge(href);
  if (fromBridge != null && fromBridge.isNotEmpty) return fromBridge;
  if (isGenesis50Href(href)) return normalizeGenesis50Href(href);
  return normalizeGenesis50Href(href);
}

Future<bool> _openGenesis50TabNative(String url) async {
  final raw = url.trim();
  if (raw.isEmpty) return false;
  try {
    await _channel.invokeMethod<void>('openGenesis50Tab', {
      'url': raw,
      'toolbarColor': AppColors.paper.toARGB32(),
    });
    return true;
  } catch (_) {
    return false;
  }
}

/// 鉴权完成后用 Custom Tabs 打开（无 WebView；顶栏仅 ×，地址栏可隐藏）。
Future<void> openGenesis50InCustomTab(
  BuildContext context, {
  required String href,
}) async {
  if (!context.mounted) return;
  final target = resolveGenesis50RawTarget(href);
  if (target.isEmpty) return;

  unawaited(
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => PopScope(
        canPop: false,
        child: AlertDialog(
          backgroundColor: AppColors.paper,
          content: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(
                width: 24,
                height: 24,
                child: CircularProgressIndicator(strokeWidth: 2.5),
              ),
              const SizedBox(width: 16),
              Flexible(
                child: Text(
                  '正在进入活动…',
                  style: Theme.of(ctx).textTheme.bodyMedium,
                ),
              ),
            ],
          ),
        ),
      ),
    ),
  );

  String? error;
  try {
    final url = await resolveGenesis50OpenUrl(target);
    final ok = await _openGenesis50TabNative(url);
    if (!ok) {
      error = '无法打开活动页，请确认已安装 Chrome 后重试';
    }
  } catch (_) {
    error = '进入活动失败，请检查网络后重试';
  } finally {
    if (context.mounted) {
      final navigator = Navigator.of(context, rootNavigator: true);
      if (navigator.canPop()) {
        navigator.pop();
      }
    }
  }

  if (error != null && context.mounted) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(error)),
    );
  }
}
