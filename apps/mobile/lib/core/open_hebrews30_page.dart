/// 希伯来书 30 天：安卓 App 内全屏 WebView。主框架打不开或空白时退回 Custom Tabs。
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

import 'genesis50_auth.dart';
import 'open_genesis50_tab.dart';
import 'theme.dart';

const _blankProbeJs = '''
(function(){
  try {
    var b = document.body;
    if (!b) return '0:0';
    var text = ((b.innerText || '').replace(/\\s+/g, '')).length;
    var nodes = b.getElementsByTagName('*').length;
    return text + ':' + nodes;
  } catch (e) {
    return '1:8';
  }
})()
''';

/// 鉴权后在彼爱内打开。返回前若页内加载失败，再走 [openGenesis50InCustomTab]。
Future<void> openHebrews30InApp(
  BuildContext context, {
  required String href,
  String? title,
}) async {
  if (!context.mounted) return;
  final target = resolveGenesis50RawTarget(href);
  if (target.isEmpty) {
    await openGenesis50InCustomTab(context, href: href);
    return;
  }

  final navigator = Navigator.of(context, rootNavigator: true);
  final dialog = DialogRoute<void>(
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
              child: Text('正在进入活动…', style: Theme.of(ctx).textTheme.bodyMedium),
            ),
          ],
        ),
      ),
    ),
  );
  unawaited(navigator.push(dialog));

  String? url;
  try {
    final resolved = await resolveGenesis50OpenUrl(target);
    if (resolved.trim().isNotEmpty) url = resolved.trim();
  } catch (_) {
    url = null;
  } finally {
    try {
      navigator.removeRoute(dialog);
    } catch (_) {}
  }

  if (!context.mounted) return;
  if (url == null) {
    await openGenesis50InCustomTab(context, href: href);
    return;
  }

  final passed = title?.trim() ?? '';
  final pageTitle = (passed.isNotEmpty && passed != '创世记 50 天')
      ? passed
      : inviteCampaignDisplayTitle(target);

  final gaveUp = await navigator.push<bool>(
    MaterialPageRoute<bool>(
      fullscreenDialog: true,
      builder: (_) => _Hebrews30InAppPage(url: url!, title: pageTitle),
    ),
  );
  if (gaveUp == true && context.mounted) {
    await openGenesis50InCustomTab(context, href: url);
  }
}

class _Hebrews30InAppPage extends StatefulWidget {
  const _Hebrews30InAppPage({required this.url, required this.title});

  final String url;
  final String title;

  @override
  State<_Hebrews30InAppPage> createState() => _Hebrews30InAppPageState();
}

class _Hebrews30InAppPageState extends State<_Hebrews30InAppPage> {
  WebViewController? _controller;
  var _loading = true;
  var _hadFirstPaint = false;
  var _leaving = false;
  var _probed = false;
  String? _mainUrl;
  Timer? _watchdog;
  Timer? _blankCheck;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(_start(widget.url));
    });
  }

  @override
  void dispose() {
    _watchdog?.cancel();
    _blankCheck?.cancel();
    super.dispose();
  }

  void _armWatchdog() {
    _watchdog?.cancel();
    if (_hadFirstPaint || _leaving) return;
    _watchdog = Timer(const Duration(seconds: 16), () {
      if (!_hadFirstPaint) _failover();
    });
  }

  void _failover() {
    if (_leaving || !mounted) return;
    _leaving = true;
    _watchdog?.cancel();
    _blankCheck?.cancel();
    Navigator.of(context).pop(true);
  }

  Future<void> _close() async {
    if (_leaving || !mounted) return;
    final c = _controller;
    if (c != null) {
      try {
        if (await c.canGoBack()) {
          await c.goBack();
          return;
        }
      } catch (_) {}
    }
    if (!mounted || _leaving) return;
    _leaving = true;
    _watchdog?.cancel();
    _blankCheck?.cancel();
    Navigator.of(context).pop(false);
  }

  void _scheduleBlankCheck() {
    if (_probed || _leaving) return;
    _probed = true;
    _blankCheck?.cancel();
    _blankCheck = Timer(const Duration(seconds: 5), () {
      unawaited(_probeBlank());
    });
  }

  Future<void> _probeBlank() async {
    if (_leaving || !mounted) return;
    final c = _controller;
    if (c == null) return;
    try {
      final raw = await c.runJavaScriptReturningResult(_blankProbeJs);
      if (_leaving || !mounted) return;
      final s = '$raw'.replaceAll('"', '').trim();
      final parts = s.split(':');
      final text = int.tryParse(parts.first) ?? 0;
      final nodes = parts.length > 1 ? (int.tryParse(parts[1]) ?? 0) : 0;
      if (text < 2 && nodes < 8) _failover();
    } catch (_) {
      // 脚本不可用时留在 App 内，避免误开浏览器。
    }
  }

  bool _sameDocument(String a, String b) {
    final left = a.trim().split('#').first;
    final right = b.trim().split('#').first;
    return left.isNotEmpty && left == right;
  }

  Future<void> _configure(WebViewController controller) async {
    await controller.setJavaScriptMode(JavaScriptMode.unrestricted);
    await controller.setBackgroundColor(AppColors.paper);
    await controller.setNavigationDelegate(
      NavigationDelegate(
        onPageStarted: (url) {
          _mainUrl = url;
          if (!mounted) return;
          setState(() => _loading = true);
          _armWatchdog();
        },
        onPageFinished: (_) {
          _watchdog?.cancel();
          if (!mounted || _leaving) return;
          setState(() {
            _loading = false;
            _hadFirstPaint = true;
          });
          _scheduleBlankCheck();
        },
        onWebResourceError: (err) {
          if (err.isForMainFrame != true) return;
          // 重定向会取消上一个主框架请求（Chromium ERR_ABORTED）。
          if (err.errorCode == -3) return;
          _failover();
        },
        onHttpError: (err) {
          final code = err.response?.statusCode;
          if (code == null || code < 400) return;
          final req = err.request?.uri.toString() ?? '';
          final main = _mainUrl ?? widget.url;
          if (!_sameDocument(req, main)) return;
          _failover();
        },
        onNavigationRequest: (req) {
          final u = Uri.tryParse(req.url);
          if (u == null) return NavigationDecision.prevent;
          if (u.scheme == 'http' ||
              u.scheme == 'https' ||
              u.scheme == 'about' ||
              u.scheme == 'data' ||
              u.scheme == 'blob') {
            return NavigationDecision.navigate;
          }
          return NavigationDecision.prevent;
        },
      ),
    );

    final platform = controller.platform;
    if (platform is AndroidWebViewController) {
      try {
        await platform.setUserAgent(
          'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 '
          '(KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
        );
      } catch (_) {}
      try {
        final cookieMgr = WebViewCookieManager().platform;
        if (cookieMgr is AndroidWebViewCookieManager) {
          await cookieMgr.setAcceptThirdPartyCookies(platform, true);
        }
      } catch (_) {}
      try {
        await platform.setMediaPlaybackRequiresUserGesture(false);
      } catch (_) {}
    }
  }

  Future<void> _start(String url) async {
    final controller = WebViewController();
    await _configure(controller);
    if (!mounted || _leaving) return;
    setState(() {
      _controller = controller;
      _loading = true;
    });
    _armWatchdog();
    try {
      await controller.loadRequest(Uri.parse(url));
    } catch (_) {
      _failover();
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop || _leaving) return;
        unawaited(_close());
      },
      child: Scaffold(
        backgroundColor: AppColors.paper,
        appBar: AppBar(
          title: Text(
            widget.title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          leading: IconButton(
            icon: const Icon(Icons.close),
            onPressed: () => unawaited(_close()),
          ),
        ),
        body: Stack(
          children: [
            if (_controller != null) WebViewWidget(controller: _controller!),
            if (_loading && !_hadFirstPaint)
              const ColoredBox(
                color: AppColors.paper,
                child: Center(
                  child: SizedBox(
                    width: 28,
                    height: 28,
                    child: CircularProgressIndicator(strokeWidth: 2.5),
                  ),
                ),
              )
            else if (_loading)
              const Align(
                alignment: Alignment.topCenter,
                child: LinearProgressIndicator(minHeight: 2),
              ),
          ],
        ),
      ),
    );
  }
}
