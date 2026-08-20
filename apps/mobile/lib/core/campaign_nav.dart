/// 活动外链导航（对齐 `apps/web/lib/campaign_nav.ts`）。
library;

import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

import 'genesis50_auth.dart';
import 'open_external.dart';
import 'open_h5.dart';
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

String? _genesis50TargetFromBridge(String href) {
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

String _genesis50Target(String href) {
  return _genesis50TargetFromBridge(href) ?? normalizeCampaignHref(href);
}

/// 创世记 50：Flutter 鉴权 + Chrome Custom Tabs（不用 WebView 嵌外站 SPA）。
Future<void> _openGenesis50External(
  BuildContext context, {
  required String href,
  String? title,
}) async {
  final target = _genesis50Target(href);
  await Navigator.of(context).push(
    MaterialPageRoute<void>(
      builder: (_) => _Genesis50CustomTabPage(
        targetHref: target,
        title: title ?? '创世记 50 天',
      ),
    ),
  );
}

/// 打开活动 / 推荐卡链接：站内 H5 或原生路由；真外链 WebView / Custom Tabs。
/// 创世记 50：Dart 鉴权后 Custom Tabs 打开原链接。
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

/// 创世记 50：Dart 鉴权 → Custom Tabs → 返回彼爱。
class _Genesis50CustomTabPage extends StatefulWidget {
  const _Genesis50CustomTabPage({
    required this.targetHref,
    required this.title,
  });

  final String targetHref;
  final String title;

  @override
  State<_Genesis50CustomTabPage> createState() =>
      _Genesis50CustomTabPageState();
}

class _Genesis50CustomTabPageState extends State<_Genesis50CustomTabPage> {
  var _loading = true;
  String? _error;
  String? _resolvedUrl;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(_launch());
    });
  }

  Future<void> _launch() async {
    if (!mounted) return;
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final url = await resolveGenesis50OpenUrl(widget.targetHref);
      if (!mounted) return;
      _resolvedUrl = url;
      final ok = await openInAppBrowser(url, title: widget.title);
      if (!mounted) return;
      if (ok) {
        Navigator.of(context).pop();
        return;
      }
      setState(() {
        _loading = false;
        _error = '无法打开活动页面，请确认已安装 Chrome 或其他浏览器';
      });
    } catch (e) {
      if (kDebugMode) debugPrint('genesis50 custom tab: $e');
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = '进入活动失败，请检查网络后重试';
      });
    }
  }

  Future<void> _retry() async {
    if (_resolvedUrl != null) {
      setState(() {
        _loading = true;
        _error = null;
      });
      final ok = await openInAppBrowser(_resolvedUrl!, title: widget.title);
      if (!mounted) return;
      if (ok) {
        Navigator.of(context).pop();
        return;
      }
      setState(() {
        _loading = false;
        _error = '无法打开活动页面，请确认已安装 Chrome 或其他浏览器';
      });
      return;
    }
    unawaited(_launch());
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
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (_loading) ...[
                const SizedBox(
                  width: 28,
                  height: 28,
                  child: CircularProgressIndicator(strokeWidth: 2.5),
                ),
                const SizedBox(height: 14),
                const Text('正在进入活动…'),
              ] else if (_error != null) ...[
                Text(
                  _error!,
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: () => unawaited(_retry()),
                  child: const Text('重试'),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// 非创世记 50 的真外链：全屏 WebView。
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
      if (!mounted || !_loading) return;
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
      } catch (e) {
        if (kDebugMode) debugPrint('external webview cookies: $e');
      }
      try {
        await platform.setMediaPlaybackRequiresUserGesture(false);
      } catch (_) {}
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
                          });
                          unawaited(_startWebView(widget.url));
                        },
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
                    const Text('正在打开…'),
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
