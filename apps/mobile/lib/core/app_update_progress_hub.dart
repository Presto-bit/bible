/// 将 `AppUpdateService.downloadState` 推送到存活 H5 WebView（设置页可看进度）。
library;

import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:webview_flutter/webview_flutter.dart';

import 'app_update.dart';

class AppUpdateProgressHub {
  AppUpdateProgressHub._();

  static final Set<WebViewController> _controllers = {};
  static VoidCallback? _listener;
  static Timer? _throttle;

  static void attach() {
    if (_listener != null) return;
    _listener = () {
      _throttle?.cancel();
      _throttle = Timer(const Duration(milliseconds: 250), broadcast);
    };
    AppUpdateService.downloadState.addListener(_listener!);
  }

  static void register(WebViewController controller) {
    attach();
    _controllers.add(controller);
    unawaited(_push(controller, AppUpdateService.downloadState.value));
  }

  static void unregister(WebViewController controller) {
    _controllers.remove(controller);
  }

  static void broadcast() {
    final snap = AppUpdateService.downloadState.value;
    for (final c in List<WebViewController>.from(_controllers)) {
      unawaited(_push(c, snap));
    }
  }

  static Future<void> _push(
    WebViewController controller,
    AppUpdateDownloadState state,
  ) async {
    final json = jsonEncode(state.toJsMap());
    try {
      await controller.runJavaScript('''
(function(){
  try {
    var detail = $json;
    window.__PEIAI_APP_UPDATE__ = detail;
    window.dispatchEvent(new CustomEvent('peiai-app-update', { detail: detail }));
  } catch (e) {}
})();
''');
    } catch (_) {
      /* WebView 可能已销毁 */
    }
  }
}
