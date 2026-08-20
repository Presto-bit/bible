/// 活动外链导航（对齐 `apps/web/lib/campaign_nav.ts`）。
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

import 'genesis50_auth.dart';
import 'open_h5.dart';
import 'open_genesis50_tab.dart';
import 'h5_whitelist.dart';
import 'theme.dart';

export 'genesis50_auth.dart' show isGenesis50Href, isGenesis50BridgeHref;

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

Future<void> _openGenesis50External(
  BuildContext context, {
  required String href,
  String? title,
}) async {
  await openGenesis50InCustomTab(context, href: href);
}

/// 打开活动 / 推荐卡链接：站内 H5 或原生路由；真外链 App 内 WebView。
/// 创世记 50：Flutter 鉴权 + Chrome Custom Tabs（Chrome 内核，隐藏地址栏）。
Future<void> openCampaignHref(
  BuildContext context,
  String href, {
  String? title,
}) async {
  final raw = normalizeCampaignHref(href);
  if (raw.isEmpty || !context.mounted) return;

  if (isGenesis50BridgeHref(raw) || isGenesis50Href(raw)) {
    await _openGenesis50External(context, href: raw, title: title);
    return;
  }

  // 站内相对路径
  if (raw.startsWith('/') && !raw.startsWith('//')) {
    final u = Uri.parse(raw.startsWith('/') ? raw : '/$raw');
    final pathOnly = H5Whitelist.stripAppBasePath(
      u.path.isEmpty ? '/' : u.path,
    );
    final full = '$pathOnly${u.hasQuery ? '?${u.query}' : ''}';
    if (isGenesis50BridgeHref(full)) {
      await _openGenesis50External(context, href: full, title: title);
      return;
    }
    if (openH5IfAllowed(context, full, title: title)) return;
    if (pathOnly == '/reader' || pathOnly.startsWith('/reader')) {
      context.push(full);
      return;
    }
    if (pathOnly == '/plans' || pathOnly.startsWith('/plans')) {
      context.push(full);
      return;
    }
    context.push(full.startsWith('/') ? full : '/$full');
    return;
  }

  final uri = Uri.tryParse(raw);
  if (uri != null &&
      (uri.scheme == 'http' || uri.scheme == 'https') &&
      uri.host.isNotEmpty) {
    if (_isAppHostname(uri.host)) {
      final path = H5Whitelist.stripAppBasePath(
        uri.path.isEmpty ? '/' : uri.path,
      );
      final full = '$path${uri.hasQuery ? '?${uri.query}' : ''}';
      if (isGenesis50BridgeHref(raw) || isGenesis50BridgeHref(full)) {
        await _openGenesis50External(context, href: raw, title: title);
        return;
      }
      if (openH5IfAllowed(context, full, title: title)) return;
      context.push(full);
      return;
    }
    if (isGenesis50Href(raw)) {
      await _openGenesis50External(context, href: raw, title: title);
      return;
    }
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => _ExternalBrowserPage(
          url: raw,
          title: title ?? uri.host.replaceFirst(RegExp(r'^www\.'), ''),
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
  });
  final String url;
  final String title;

  @override
  State<_ExternalBrowserPage> createState() => _ExternalBrowserPageState();
}

class _ExternalBrowserPageState extends State<_ExternalBrowserPage> {
  WebViewController? _controller;
  var _loading = true;
  var _hadFirstPaint = false;
  String? _error;
  Timer? _loadWatchdog;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(_startWebView(widget.url));
    });
  }

  @override
  void dispose() {
    _loadWatchdog?.cancel();
    super.dispose();
  }

  void _armLoadWatchdog() {
    _loadWatchdog?.cancel();
    _loadWatchdog = Timer(const Duration(seconds: 18), () {
      if (!mounted) return;
      if (!_loading) return;
      setState(() => _loading = false);
    });
  }

  Future<void> _configureController(WebViewController controller) async {
    await controller.setJavaScriptMode(JavaScriptMode.unrestricted);
    await controller.setBackgroundColor(AppColors.paper);
    await controller.setNavigationDelegate(
      NavigationDelegate(
        onPageStarted: (_) {
          if (mounted) {
            setState(() {
              _loading = true;
              _error = null;
            });
          }
          _armLoadWatchdog();
        },
        onPageFinished: (_) {
          _loadWatchdog?.cancel();
          if (!mounted) return;
          setState(() {
            _loading = false;
            _hadFirstPaint = true;
          });
        },
        onWebResourceError: (err) {
          if (!(err.isForMainFrame ?? true)) return;
          _loadWatchdog?.cancel();
          if (!mounted) return;
          setState(() {
            _loading = false;
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
      } catch (_) {}
      try {
        await platform.setMediaPlaybackRequiresUserGesture(false);
      } catch (_) {}
    }
  }

  Future<void> _startWebView(String url) async {
    final controller = WebViewController();
    await _configureController(controller);
    if (!mounted) return;
    setState(() {
      _controller = controller;
      _error = null;
      _loading = true;
    });
    _armLoadWatchdog();
    try {
      await controller.loadRequest(Uri.parse(url));
    } catch (_) {
      _loadWatchdog?.cancel();
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = '页面加载失败，请检查网络后重试';
      });
    }
  }

  void _retry() {
    setState(() {
      _error = null;
      _loading = true;
    });
    unawaited(_startWebView(widget.url));
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
                        onPressed: _retry,
                        child: const Text('重试'),
                      ),
                    ],
                  ),
                ),
              ),
            )
          else if (_loading && !_hadFirstPaint)
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
                    Text('正在打开…'),
                  ],
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
    );
  }
}
