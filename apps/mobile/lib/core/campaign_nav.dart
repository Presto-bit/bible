/// 活动外链导航（对齐 `apps/web/lib/campaign_nav.ts`）。
library;

import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

import 'genesis50_auth.dart';
import 'open_h5.dart';
import 'theme.dart';

export 'genesis50_auth.dart' show isGenesis50Href;

bool _isAppHostname(String host) {
  final h = host.trim().toLowerCase().replaceFirst(RegExp(r'^www\.'), '');
  if (h.isEmpty) return false;
  return h == '2sc.prestoai.cn' ||
      h == 'prestoai.cn' ||
      h == 'localhost' ||
      h == '127.0.0.1' ||
      h.endsWith('.prestoai.cn');
}

String normalizeCampaignHref(String href) {
  final t = href.trim();
  if (t.isEmpty) return '';
  if (t.startsWith('//')) return 'https:$t';
  return t;
}

/// 打开活动 / 推荐卡链接：站内 H5 或原生路由；真外链全屏 WebView。
/// 创世记 50：先打开彼爱同源桥接页，再跳转外站（方案 A+B）。
Future<void> openCampaignHref(
  BuildContext context,
  String href, {
  String? title,
}) async {
  final raw = normalizeCampaignHref(href);
  if (raw.isEmpty || !context.mounted) return;

  // 已是桥接页（深链等）直接打开
  if (isGenesis50BridgeHref(raw)) {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => _ExternalBrowserPage(
          url: raw,
          title: title ?? '创世记 50 天',
          genesis50: true,
        ),
      ),
    );
    return;
  }

  // 站内相对路径
  if (raw.startsWith('/') && !raw.startsWith('//')) {
    final pathOnly = raw.split('?').first;
    if (openH5IfAllowed(context, raw, title: title)) return;
    if (pathOnly == '/reader' || pathOnly.startsWith('/reader')) {
      context.push(raw);
      return;
    }
    if (pathOnly == '/plans' || pathOnly.startsWith('/plans')) {
      context.push(raw);
      return;
    }
    context.push(raw.startsWith('/') ? raw : '/$raw');
    return;
  }

  final uri = Uri.tryParse(raw);
  if (uri != null &&
      (uri.scheme == 'http' || uri.scheme == 'https') &&
      uri.host.isNotEmpty) {
    if (_isAppHostname(uri.host)) {
      final path = uri.path.isEmpty ? '/' : uri.path;
      final full = '$path${uri.hasQuery ? '?${uri.query}' : ''}';
      if (openH5IfAllowed(context, full, title: title)) return;
      context.push(full);
      return;
    }
    final genesis50 = isGenesis50Href(raw);
    final launchUrl = genesis50 ? buildGenesis50BridgeUrl(raw) : raw;
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => _ExternalBrowserPage(
          url: launchUrl,
          title:
              title ??
              (genesis50
                  ? '创世记 50 天'
                  : uri.host.replaceFirst(RegExp(r'^www\.'), '')),
          genesis50: genesis50,
          genesis50Target: genesis50 ? raw : null,
        ),
      ),
    );
    return;
  }

  // 兜底
  if (!openH5IfAllowed(
    context,
    raw.startsWith('/') ? raw : '/$raw',
    title: title,
  )) {
    if (context.mounted) {
      context.push(raw.startsWith('/') ? raw : '/$raw');
    }
  }
}

/// 是否像活动链接（用于首页槽位分流）
bool looksLikeCampaignHref(String href) {
  final t = href.trim().toLowerCase();
  return t.contains('campaign') ||
      isGenesis50Href(t) ||
      t.startsWith('http://') ||
      t.startsWith('https://');
}

class _ExternalBrowserPage extends StatefulWidget {
  const _ExternalBrowserPage({
    required this.url,
    required this.title,
    this.genesis50 = false,
    this.genesis50Target,
  });
  final String url;
  final String title;
  final bool genesis50;
  /// 创世记 50 外站目标 URL（重试桥接用）
  final String? genesis50Target;

  @override
  State<_ExternalBrowserPage> createState() => _ExternalBrowserPageState();
}

class _ExternalBrowserPageState extends State<_ExternalBrowserPage> {
  WebViewController? _controller;
  var _loading = true;
  var _hadFirstPaint = false;
  var _authPhase = false;
  String? _error;
  Timer? _loadWatchdog;
  Timer? _blankProbe;
  var _blankProbeDone = false;
  var _blankRetryCount = 0;

  String get _retryUrl {
    if (widget.genesis50Target != null && widget.genesis50Target!.isNotEmpty) {
      return buildGenesis50BridgeUrl(widget.genesis50Target!);
    }
    return widget.url;
  }

  @override
  void initState() {
    super.initState();
    _authPhase = widget.genesis50;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(_startWebView(widget.url));
    });
  }

  @override
  void dispose() {
    _loadWatchdog?.cancel();
    _blankProbe?.cancel();
    super.dispose();
  }

  void _armLoadWatchdog() {
    _loadWatchdog?.cancel();
    final seconds = widget.genesis50 ? 36 : 18;
    _loadWatchdog = Timer(Duration(seconds: seconds), () {
      if (!mounted || !_loading) return;
      setState(() => _loading = false);
    });
  }

  void _scheduleBlankProbe(WebViewController controller) {
    if (!widget.genesis50 || _blankProbeDone) return;
    _blankProbe?.cancel();
    _blankProbe = Timer(const Duration(milliseconds: 6500), () async {
      if (!mounted || _controller != controller) return;
      try {
        final raw = await controller.runJavaScriptReturningResult('''
(function(){
  try {
    var root = document.getElementById('root') || document.getElementById('app');
    var main = document.querySelector('main');
    var text = (document.body && (document.body.innerText || '')) || '';
    var hasUi = text.trim().length > 20
      || !!(root && root.childElementCount > 0)
      || !!(main && main.childElementCount > 0);
    return hasUi ? 'ok' : 'blank';
  } catch (e) { return 'ok'; }
})();
''');
        final status = '$raw'.replaceAll('"', '');
        if (!status.contains('blank')) {
          _blankRetryCount = 0;
          return;
        }
        if (_blankRetryCount < 1) {
          _blankRetryCount++;
          if (!mounted) return;
          setState(() {
            _error = null;
            _loading = true;
            _authPhase = true;
          });
          unawaited(_startWebView(_retryUrl));
          return;
        }
        _blankProbeDone = true;
        if (!mounted) return;
        setState(() {
          _loading = false;
          _error = '活动页面未能显示内容，请检查网络后重试';
        });
      } catch (_) {}
    });
  }

  Future<void> _injectGenesis50StorageFallback(
    WebViewController controller,
    String pageUrl,
  ) async {
    if (!widget.genesis50 || !isGenesis50Href(pageUrl)) return;
    final uri = Uri.tryParse(pageUrl);
    if (uri == null) return;
    final access = uri.queryParameters['access_token'];
    final refresh = uri.queryParameters['refresh_token'];
    if ((access ?? '').isEmpty || (refresh ?? '').isEmpty) return;
    final payload = {
      'access_token': access,
      'refresh_token': refresh,
      'expires_in': int.tryParse(uri.queryParameters['expires_in'] ?? '') ?? 3600,
      if (uri.queryParameters['expires_at'] != null)
        'expires_at': int.tryParse(uri.queryParameters['expires_at'] ?? ''),
      'token_type': uri.queryParameters['token_type'] ?? 'bearer',
    };
    final key = genesis50AuthStorageKey;
    await controller.runJavaScript('''
(function(){
  try {
    localStorage.setItem(${jsonEncode(key)}, JSON.stringify(${jsonEncode(payload)}));
  } catch (e) {}
})();
''');
  }

  Future<void> _configureController(WebViewController controller) async {
    await controller.setJavaScriptMode(JavaScriptMode.unrestricted);
    await controller.setBackgroundColor(AppColors.paper);
    await controller.setNavigationDelegate(
      NavigationDelegate(
        onPageStarted: (url) {
          if (mounted) {
            setState(() {
              _loading = true;
              _error = null;
              if (widget.genesis50 &&
                  isGenesis50Href(url) &&
                  !isGenesis50BridgeHref(url)) {
                _authPhase = false;
              }
            });
          }
          _armLoadWatchdog();
        },
        onPageFinished: (url) async {
          _loadWatchdog?.cancel();
          if (!mounted) return;
          if (isGenesis50BridgeHref(url)) {
            setState(() {
              _loading = true;
              _authPhase = true;
            });
            return;
          }
          setState(() {
            _loading = false;
            _authPhase = false;
            _hadFirstPaint = true;
          });
          if (widget.genesis50 && isGenesis50Href(url)) {
            await _injectGenesis50StorageFallback(controller, url);
            _scheduleBlankProbe(controller);
          }
        },
        onWebResourceError: (err) {
          if (!(err.isForMainFrame ?? true)) return;
          _loadWatchdog?.cancel();
          if (!mounted) return;
          setState(() {
            _loading = false;
            _authPhase = false;
            _error ??= '页面加载失败，请检查网络后重试';
          });
        },
        onHttpError: (err) {
          final code = err.response?.statusCode;
          if (code == null || code < 400) return;
          _loadWatchdog?.cancel();
          if (!mounted) return;
          setState(() {
            _loading = false;
            _authPhase = false;
            _error ??= '页面打开失败（$code），请稍后重试';
          });
        },
      ),
    );

    final platform = controller.platform;
    if (platform is AndroidWebViewController) {
      try {
        final cookieMgr = WebViewCookieManager().platform;
        if (cookieMgr is AndroidWebViewCookieManager) {
          await cookieMgr.setAcceptThirdPartyCookies(platform, true);
        }
      } catch (e) {
        if (kDebugMode) debugPrint('external webview cookies: $e');
      }
      try {
        await platform.setMediaPlaybackRequiresUserGesture(false);
      } catch (_) {}
      // 去掉 `; wv`，降低被当成内嵌壳空页的概率；保持接近 Chrome UA
      try {
        final ua = await controller.getUserAgent();
        final cleaned = (ua ?? '')
            .replaceAll(RegExp(r';\s*wv\)'), ')')
            .replaceAll('; wv', '');
        if (cleaned.trim().isNotEmpty) {
          await controller.setUserAgent(cleaned);
        }
      } catch (_) {}
    }
  }

  Future<void> _startWebView(String url) async {
    _blankProbeDone = false;
    final controller = WebViewController();
    await _configureController(controller);
    if (!mounted) return;
    setState(() {
      _controller = controller;
      _error = null;
      _loading = true;
      if (widget.genesis50) _authPhase = true;
    });
    _armLoadWatchdog();
    try {
      await controller.loadRequest(Uri.parse(url));
    } catch (_) {
      _loadWatchdog?.cancel();
      if (!mounted) return;
      setState(() {
        _loading = false;
        _authPhase = false;
        _error = '页面加载失败，请检查网络后重试';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.paper,
      appBar: AppBar(
        title: Text(widget.title, maxLines: 1, overflow: TextOverflow.ellipsis),
        leading: IconButton(
          icon: const Icon(Icons.close),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: Stack(
        children: [
          if (_controller != null) WebViewWidget(controller: _controller!),
          if (_error != null)
            ColoredBox(
              color: AppColors.paper,
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
                        onPressed: () {
                          setState(() {
                            _error = null;
                            _loading = true;
                            _blankProbeDone = false;
                            _authPhase = widget.genesis50;
                          });
                          unawaited(_startWebView(_retryUrl));
                        },
                        child: const Text('重试'),
                      ),
                    ],
                  ),
                ),
              ),
            )
          else if ((_authPhase || _loading) && !_hadFirstPaint)
            ColoredBox(
              color: AppColors.paper,
              child: Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const SizedBox(
                      width: 28,
                      height: 28,
                      child: CircularProgressIndicator(strokeWidth: 2.5),
                    ),
                    const SizedBox(height: 14),
                    Text(widget.genesis50 ? '正在进入活动…' : '正在打开…'),
                  ],
                ),
              ),
            )
          else if (_authPhase || _loading)
            const Align(
              alignment: Alignment.topCenter,
              child: LinearProgressIndicator(minHeight: 2),
            ),
        ],
      ),
    );
  }
}
