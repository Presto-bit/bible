/// 登出：清 H5 localStorage token + client 标记，并广播 Web 侧监听。
library;

import 'package:webview_flutter/webview_flutter.dart';

class H5SessionBridge {
  H5SessionBridge._();

  static final Set<WebViewController> _controllers = {};

  static void register(WebViewController c) => _controllers.add(c);
  static void unregister(WebViewController c) => _controllers.remove(c);

  /// 登出：清 H5 localStorage token + client kind + 样式标记
  static Future<void> clearWebAuth() async {
    const js = r'''
(function(){
  try {
    localStorage.removeItem('presto_session_token');
    localStorage.removeItem('peiai_ft_token');
  } catch (e) {}
  try {
    sessionStorage.removeItem('peiai_client_kind');
  } catch (e) {}
  try {
    window.dispatchEvent(new CustomEvent('peiai-flutter-logout'));
    if (typeof window.__PEIAI_ON_LOGOUT__ === 'function') window.__PEIAI_ON_LOGOUT__();
  } catch (e) {}
})();
''';
    for (final c in List<WebViewController>.from(_controllers)) {
      try {
        await c.runJavaScript(js);
      } catch (_) {}
    }
  }
}
