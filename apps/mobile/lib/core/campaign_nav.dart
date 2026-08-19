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
import 'h5_whitelist.dart';
import 'config.dart';
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

String _absoluteBridgeUrl(String href) {
  final raw = normalizeCampaignHref(href);
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  final u = Uri.parse(raw.startsWith('/') ? raw : '/$raw');
  final path = H5Whitelist.stripAppBasePath(u.path.isEmpty ? '/' : u.path);
  return Uri.parse(AppConfig.webBaseUrl)
      .replace(
        path: path,
        queryParameters: u.queryParameters.isEmpty ? null : u.queryParameters,
      )
      .toString();
}

Future<void> _openGenesis50External(
  BuildContext context, {
  required String href,
  String? title,
}) async {
  final bridgeUrl = isGenesis50BridgeHref(href)
      ? _absoluteBridgeUrl(href)
      : buildGenesis50BridgeUrl(href);
  await Navigator.of(context).push(
    MaterialPageRoute<void>(
      builder: (_) => _ExternalBrowserPage(
        url: bridgeUrl,
        title: title ?? '创世记 50 天',
        genesis50: true,
        genesis50Target: isGenesis50BridgeHref(href)
            ? _genesis50TargetFromBridge(href)
            : normalizeCampaignHref(href),
      ),
    ),
  );
}

/// 打开活动 / 推荐卡链接：站内 H5 或原生路由；真外链全屏 WebView。
/// 创世记 50：先打开彼爱同源桥接页（与 PWA 一致），由页内 JS 鉴权再跳外站。
Future<void> openCampaignHref(
  BuildContext context,
  String href, {
  String? title,
}) async {
  final raw = normalizeCampaignHref(href);
  if (raw.isEmpty || !context.mounted) return;

  if (isGenesis50BridgeHref(raw)) {
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
    final genesis50 = isGenesis50Href(raw);
    if (genesis50) {
      await _openGenesis50External(context, href: raw, title: title);
      return;
    }
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => _ExternalBrowserPage(
          url: raw,
          title: title ?? uri.host.replaceFirst(RegExp(r'^www\.'), ''),
          genesis50: false,
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

  /// 创世记 50 原站 URL（Dart 鉴权 + 重试用）
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
  Timer? _bridgeStallTimer;
  var _blankProbeDone = false;
  var _blankRetryCount = 0;
  var _manualRetryCount = 0;
  var _nativeAuthFallback = false;
  var _genesis50CleanReloadDone = false;
  var _genesis50AuthRetryCount = 0;
  Genesis50Session? _genesis50Session;

  String get _genesis50RawTarget {
    final fromWidget = widget.genesis50Target?.trim();
    if (fromWidget != null && fromWidget.isNotEmpty) return fromWidget;
    if (isGenesis50Href(widget.url)) return widget.url;
    return _genesis50TargetFromBridge(widget.url) ?? widget.url;
  }

  String _genesis50LaunchUrl() {
    if (isGenesis50BridgeHref(widget.url)) return widget.url;
    return buildGenesis50BridgeUrl(_genesis50RawTarget);
  }

  @override
  void initState() {
    super.initState();
    _authPhase = widget.genesis50;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (widget.genesis50) {
        _nativeAuthFallback = true;
        unawaited(_resolveGenesis50AndStart());
      } else {
        unawaited(_startWebView(widget.url));
      }
    });
  }

  @override
  void dispose() {
    _loadWatchdog?.cancel();
    _blankProbe?.cancel();
    _bridgeStallTimer?.cancel();
    super.dispose();
  }

  void _scheduleBridgeStallFallback(WebViewController controller) {
    _bridgeStallTimer?.cancel();
    _bridgeStallTimer = Timer(const Duration(seconds: 8), () async {
      if (!mounted || _controller != controller || _nativeAuthFallback) return;
      try {
        final current = await controller.currentUrl();
        if (current == null || !isGenesis50BridgeHref(current)) return;
        _nativeAuthFallback = true;
        if (!mounted) return;
        unawaited(_resolveGenesis50AndStart());
      } catch (_) {}
    });
  }

  Future<void> _probeBridgeError(WebViewController controller) async {
    if (_nativeAuthFallback) return;
    try {
      final raw = await controller.runJavaScriptReturningResult('''
(function(){
  try {
    var t = (document.body && (document.body.innerText || '')) || '';
    if (/自动进入失败|缺少活动链接|链接无效/.test(t)) return 'err';
    return 'ok';
  } catch (e) { return 'ok'; }
})();
''');
      if ('$raw'.contains('err')) {
        _nativeAuthFallback = true;
        if (!mounted) return;
        unawaited(_resolveGenesis50AndStart());
      }
    } catch (_) {}
  }

  Future<void> _resolveGenesis50AndStart() async {
    final target = _genesis50RawTarget;
    if (!mounted) return;
    setState(() {
      _error = null;
      _loading = true;
      _authPhase = true;
      _blankProbeDone = false;
    });

    Genesis50Session? session;
    String launchUrl;
    try {
      if (genesis50UrlHasSession(target)) {
        launchUrl = normalizeGenesis50Href(target);
      } else {
        final code = resolveGenesis50InviteCode(target);
        try {
          session = await obtainGenesis50Session(code);
          launchUrl = buildGenesis50AuthedUrl(target, session);
        } catch (_) {
          launchUrl = buildGenesis50FallbackUrl(target, code);
        }
      }
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _authPhase = false;
        _error = '进入活动失败，请检查网络后重试';
      });
      return;
    }

    if (!mounted) return;
    _genesis50Session = session;
    await _startWebView(launchUrl, genesis50Session: session);
  }

  void _armLoadWatchdog() {
    _loadWatchdog?.cancel();
    final seconds = widget.genesis50 ? 36 : 18;
    _loadWatchdog = Timer(Duration(seconds: seconds), () {
      if (!mounted) return;
      if (!_loading && !_authPhase) return;
      setState(() {
        _loading = false;
        _authPhase = false;
      });
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
          _nativeAuthFallback = true;
          unawaited(_resolveGenesis50AndStart());
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
    final stored = _genesis50Session?.toStorageJson();
    Map<String, dynamic> payload;
    if (stored != null) {
      payload = stored;
    } else {
      final uri = Uri.tryParse(pageUrl);
      if (uri == null) return;
      final access = uri.queryParameters['access_token'];
      final refresh = uri.queryParameters['refresh_token'];
      if ((access ?? '').isEmpty || (refresh ?? '').isEmpty) return;
      payload = {
        'access_token': access,
        'refresh_token': refresh,
        'expires_in':
            int.tryParse(uri.queryParameters['expires_in'] ?? '') ?? 3600,
        if (uri.queryParameters['expires_at'] != null)
          'expires_at': int.tryParse(uri.queryParameters['expires_at'] ?? ''),
        'token_type': uri.queryParameters['token_type'] ?? 'bearer',
      };
    }
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
            _armLoadWatchdog();
            _scheduleBridgeStallFallback(controller);
            unawaited(_probeBridgeError(controller));
            return;
          }
          _bridgeStallTimer?.cancel();
          setState(() {
            _loading = false;
            _authPhase = false;
            _hadFirstPaint = true;
          });
          if (widget.genesis50 && isGenesis50Href(url)) {
            await _injectGenesis50StorageFallback(controller, url);
            final uri = Uri.tryParse(url);
            if (!_genesis50CleanReloadDone &&
                uri != null &&
                (uri.queryParameters['access_token'] ?? '').isNotEmpty) {
              _genesis50CleanReloadDone = true;
              final cleanQ = Map<String, String>.from(uri.queryParameters)
                ..remove('access_token')
                ..remove('refresh_token')
                ..remove('expires_in')
                ..remove('expires_at')
                ..remove('token_type')
                ..remove('type');
              await controller.loadRequest(
                uri.replace(
                  queryParameters: cleanQ.isEmpty ? null : cleanQ,
                  fragment: '',
                ),
              );
              return;
            }
            _scheduleBlankProbe(controller);
          }
        },
        onNavigationRequest: (req) {
          if (widget.genesis50 && isGenesis50Href(req.url)) {
            return NavigationDecision.navigate;
          }
          return NavigationDecision.navigate;
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
          if (widget.genesis50 &&
              code == 401 &&
              _genesis50AuthRetryCount < 2) {
            _genesis50AuthRetryCount++;
            _genesis50CleanReloadDone = false;
            unawaited(_resolveGenesis50AndStart());
            return;
          }
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

  Future<void> _startWebView(
    String url, {
    Genesis50Session? genesis50Session,
  }) async {
    _blankProbe?.cancel();
    _bridgeStallTimer?.cancel();
    final controller = WebViewController();
    await _configureController(controller);
    if (!mounted) return;
    setState(() {
      _controller = controller;
      _error = null;
      _loading = true;
      if (widget.genesis50 && !isGenesis50BridgeHref(url)) {
        _authPhase = false;
      } else if (widget.genesis50) {
        _authPhase = true;
      }
      if (genesis50Session != null) _genesis50Session = genesis50Session;
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

  void _retry() {
    setState(() {
      _error = null;
      _loading = true;
      _blankProbeDone = false;
      _genesis50CleanReloadDone = false;
      _authPhase = widget.genesis50;
    });
    if (widget.genesis50) {
      _manualRetryCount++;
      _nativeAuthFallback = true;
      unawaited(_resolveGenesis50AndStart());
    } else {
      unawaited(_startWebView(widget.url));
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
                        onPressed: _retry,
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
