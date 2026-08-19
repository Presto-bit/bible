/// 用 Chrome Custom Tabs / 系统浏览器打开外链（创世记 50 等活动外站）。
library;

import 'package:flutter/services.dart';

const _channel = MethodChannel('cn.prestoai.peiai/app_update');

/// 打开应用内浏览器（Android Custom Tabs；无 Chrome 时降级系统浏览器）。
Future<bool> openInAppBrowser(String url, {String? title}) async {
  final raw = url.trim();
  if (raw.isEmpty) return false;
  try {
    await _channel.invokeMethod<void>('openExternal', {
      'url': raw,
      if (title != null && title.trim().isNotEmpty) 'title': title.trim(),
    });
    return true;
  } catch (_) {
    return false;
  }
}

@Deprecated('Use openInAppBrowser')
Future<bool> openSystemBrowser(String url) => openInAppBrowser(url);
