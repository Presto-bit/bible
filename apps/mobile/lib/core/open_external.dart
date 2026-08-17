/// 用系统浏览器 / Custom Tabs 打开外链（WebView 白屏时的兜底）。
library;

import 'package:flutter/services.dart';

const _channel = MethodChannel('cn.prestoai.peiai/app_update');

Future<bool> openSystemBrowser(String url) async {
  final raw = url.trim();
  if (raw.isEmpty) return false;
  try {
    await _channel.invokeMethod<void>('openExternal', {'url': raw});
    return true;
  } catch (_) {
    return false;
  }
}
