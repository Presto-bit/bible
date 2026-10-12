/// 希伯来书 30 天：安卓 App 内全屏 WebView。
///
/// 与 PWA 一致：先打开彼爱同源桥接页 `/campaigns/genesis-50/enter`，
/// 由页内 JS 鉴权再 `location.replace` 到活动站（避免直链外站 + 过早空白检测）。
/// 用户可选「浏览器打开」时再走 Custom Tabs。
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

import 'genesis50_auth.dart';
import 'open_genesis50_tab.dart';
import 'theme.dart';

/// 先桥接页、再在 App 内打开；仅用户点「浏览器打开」时退回 Custom Tabs。
Future<void> openHebrews30InApp(
  BuildContext context, {
  required String href,
  String? title,
}) async {
  if (!context.mounted) return;
  final target = resolveGenesis50RawTarget(href);
  if (target.isEmpty || !isHebrews30Href(target)) {
    await openGenesis50InCustomTab(context, href: href);
    return;
  }

  final startUrl = isGenesis50BridgeHref(href)
      ? normalizeGenesis50Href(href)
      : buildGenesis50BridgeUrl(target);

  final passed = title?.trim() ?? '';
  final pageTitle = (passed.isNotEmpty && passed != '创世记 50 天')
      ? passed
      : inviteCampaignDisplayTitle(target);

  final navigator = Navigator.of(context, rootNavigator: true);
  final useBrowser = await navigator.push<bool>(
    MaterialPageRoute<bool>(
      fullscreenDialog: true,
      builder: (_) => _Hebrews30InAppPage(
        url: startUrl,
        title: pageTitle,
        fallbackHref: target,
      ),
    ),
  );
  if (useBrowser == true && context.mounted) {
    await openGenesis50InCustomTab(context, href: target);
  }
}

class _Hebrews30InAppPage extends StatefulWidget {
  const _Hebrews30InAppPage({
    required this.url,
    required this.title,
    required this.fallbackHref,
  });

  final String url;
  final String title;
  final String fallbackHref;

  @override
  State<_Hebrews30InAppPage> createState() => _Hebrews30InAppPageState();
}

class _Hebrews30InAppPageState extends State<_Hebrews30InAppPage> {
  WebViewController? _controller;
  var _loading = true;
  var _hadFirstPaint = false;
  String? _error;
  String? _loadUrl;
  Timer? _slowHint;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(_start(widget.url));
    });
  }

  @override
  void dispose() {
    _slowHint?.cancel();
    super.dispose();
  }

  void _armSlowHint() {
    _slowHint?.cancel();
    _slowHint = Timer(const Duration(seconds: 28), () {
      if (!mounted || !_loading) return;
      setState(() {
        _error ??= '加载较慢，可继续等待、重试，或改用浏览器打开';
      });
    });
  }

  Future<void> _close() async {
    if (!mounted) return;
    final c = _controller;
    if (c != null) {
      try {
        if (await c.canGoBack()) {
          await c.goBack();
          return;
        }
      } catch (_) {}
    }
    if (!mounted) return;
    Navigator.of(context).pop(false);
  }

  void _openInBrowser() {
    if (!mounted) return;
    Navigator.of(context).pop(true);
  }

  bool _isFatalMainFrameError(WebResourceError err) {
    if (err.isForMainFrame != true) return false;
    if (err.errorCode == -3) return false;
    switch (err.errorType) {
      case WebResourceErrorType.connect:
      case WebResourceErrorType.hostLookup:
      case WebResourceErrorType.failedSslHandshake:
      case WebResourceErrorType.badUrl:
      case WebResourceErrorType.timeout:
        return true;
      default:
        return false;
    }
  }

  Future<void> _configure(WebViewController controller) async {
    await controller.setJavaScriptMode(JavaScriptMode.unrestricted);
    await controller.setBackgroundColor(AppColors.paper);
    await controller.setNavigationDelegate(
      NavigationDelegate(
        onPageStarted: (url) {
          _loadUrl = url;
          if (!mounted) return;
          setState(() {
            _loading = true;
            _error = null;
          });
          _armSlowHint();
        },
        onPageFinished: (_) {
          _slowHint?.cancel();
          if (!mounted) return;
          setState(() {
            _loading = false;
            _hadFirstPaint = true;
            _error = null;
          });
        },
        onWebResourceError: (err) {
          if (!_isFatalMainFrameError(err)) return;
          _slowHint?.cancel();
          if (!mounted) return;
          setState(() {
            _loading = false;
            _error = '页面加载失败，请检查网络后重试，或改用浏览器打开';
          });
        },
        onHttpError: (err) {
          final code = err.response?.statusCode;
          if (code == null || code < 400) return;
          final req = err.request?.uri.toString() ?? '';
          final main = (_loadUrl ?? widget.url).split('#').first;
          if (req.split('#').first != main) return;
          _slowHint?.cancel();
          if (!mounted) return;
          setState(() {
            _loading = false;
            _error = '页面打开失败（$code），请重试或改用浏览器打开';
          });
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
        await platform.setMixedContentMode(MixedContentMode.alwaysAllow);
      } catch (_) {}
      try {
        await platform.setUserAgent(
          'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 '
          '(KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 '
          'PeiaiFlutter/1.1.1 android_hebrews30',
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
    if (!mounted) return;
    setState(() {
      _controller = controller;
      _loading = true;
      _error = null;
    });
    _armSlowHint();
    try {
      await controller.loadRequest(Uri.parse(url));
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = '页面加载失败，请检查网络后重试，或改用浏览器打开';
      });
    }
  }

  void _retry() {
    final url = widget.url;
    setState(() {
      _error = null;
      _loading = true;
      _hadFirstPaint = false;
    });
    unawaited(_start(url));
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) return;
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
          actions: [
            TextButton(
              onPressed: _openInBrowser,
              child: const Text('浏览器打开'),
            ),
          ],
        ),
        body: Stack(
          children: [
            if (_controller != null) WebViewWidget(controller: _controller!),
            if (_error != null)
              ColoredBox(
                color: AppColors.paper.withValues(alpha: 0.92),
                child: Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          _error!,
                          textAlign: TextAlign.center,
                          style: Theme.of(context).textTheme.bodyMedium,
                        ),
                        const SizedBox(height: 16),
                        FilledButton(
                          onPressed: _retry,
                          child: const Text('重试'),
                        ),
                        const SizedBox(height: 8),
                        TextButton(
                          onPressed: _openInBrowser,
                          child: const Text('浏览器打开'),
                        ),
                      ],
                    ),
                  ),
                ),
              )
            else if (_loading && !_hadFirstPaint)
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
