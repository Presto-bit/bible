/// 活动外链导航（对齐 `apps/web/lib/campaign_nav.ts`）。
library;

import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

import '../features/auth/auth_controller.dart';
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
/// 创世记 50：本机换 session 后仍在 App 内 WebView 打开（不外跳浏览器）。
Future<void> openCampaignHref(
  BuildContext context,
  String href, {
  String? title,
}) async {
  final raw = normalizeCampaignHref(href);
  if (raw.isEmpty || !context.mounted) return;

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
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => _ExternalBrowserPage(
          url: raw,
          title:
              title ??
              (genesis50
                  ? '创世记 50 天'
                  : uri.host.replaceFirst(RegExp(r'^www\.'), '')),
          genesis50: genesis50,
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

class _ExternalBrowserPage extends ConsumerStatefulWidget {
  const _ExternalBrowserPage({
    required this.url,
    required this.title,
    this.genesis50 = false,
  });
  final String url;
  final String title;
  final bool genesis50;

  @override
  ConsumerState<_ExternalBrowserPage> createState() =>
      _ExternalBrowserPageState();
}

class _ExternalBrowserPageState extends ConsumerState<_ExternalBrowserPage> {
  WebViewController? _controller;
  var _loading = true;
  var _authPhase = false;
  String? _error;
  Timer? _loadWatchdog;
  Timer? _blankProbe;
  var _blankProbeDone = false;
  var _blankRetryCount = 0;

  @override
  void initState() {
    super.initState();
    if (widget.genesis50) {
      _authPhase = true;
      WidgetsBinding.instance.addPostFrameCallback((_) => _openGenesis50());
    } else {
      unawaited(_startWebView(widget.url));
    }
  }

  @override
  void dispose() {
    _loadWatchdog?.cancel();
    _blankProbe?.cancel();
    super.dispose();
  }

  Future<void> _openGenesis50() async {
    final name = ref.read(authControllerProvider).displayName?.trim();
    final nick = (name != null && name.isNotEmpty && name.length <= 20)
        ? name
        : '同行者';
    final code = resolveGenesis50InviteCode(widget.url);
    try {
      final session = await obtainGenesis50Session(code, nickname: nick);
      if (!mounted) return;
      setState(() => _authPhase = false);
      await _startGenesisWebView(session);
    } catch (e) {
      if (kDebugMode) debugPrint('genesis50 auth failed: $e');
      if (!mounted) return;
      setState(() => _authPhase = false);
      // 鉴权失败：仍 App 内打开邀请码页（带 code，可手动进入）
      await _startWebView(buildGenesis50FallbackUrl(widget.url, code));
    }
  }

  void _armLoadWatchdog() {
    _loadWatchdog?.cancel();
    // 超时只撤 loading，不盖死错误层
    _loadWatchdog = Timer(Duration(seconds: widget.genesis50 ? 24 : 18), () {
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
    var root = document.getElementById('root');
    var text = (document.body && (document.body.innerText || '')) || '';
    var hasUi = !!(root && root.childElementCount > 0) || text.trim().length > 24;
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
          unawaited(_openGenesis50());
          return;
        }
        _blankProbeDone = true;
        if (!mounted) return;
        setState(() {
          _loading = false;
          _error = '活动页面未能显示内容，请重试';
        });
      } catch (_) {}
    });
  }

  /// 在对方 origin 下先写入 localStorage，再跳到与 PWA 相同的 query session URL。
  /// 避免 SPA 首帧已渲染邀请壳/空壳后再补会话。
  String _genesisBootstrapHtml(Genesis50Session session) {
    final target = buildGenesis50AuthedUrl(widget.url, session);
    final key = genesis50AuthStorageKey;
    final payload = session.toStorageJson();
    return '''
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>创世记 50 天</title>
<script>
(function () {
  try {
    localStorage.setItem(${jsonEncode(key)}, JSON.stringify(${jsonEncode(payload)}));
  } catch (e) {}
  location.replace(${jsonEncode(target)});
})();
</script>
</head>
<body style="margin:0;background:#FFFCFA;"></body>
</html>
''';
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
        onPageFinished: (url) {
          _loadWatchdog?.cancel();
          if (!mounted) return;
          setState(() => _loading = false);
          // 跳过 bootstrap html 的 finished；等真正进入活动域再探测
          if (widget.genesis50 &&
              url.startsWith('http') &&
              isGenesis50Href(url)) {
            _scheduleBlankProbe(controller);
          }
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

  Future<void> _startGenesisWebView(Genesis50Session session) async {
    _blankProbeDone = false;
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
      // baseUrl=对方 origin → localStorage 挂在 genesis-50；再 replace 到 query URL
      await controller.loadHtmlString(
        _genesisBootstrapHtml(session),
        baseUrl: '$genesis50Origin/',
      );
    } catch (_) {
      // loadHtmlString 失败时退回直接 loadRequest（仍带 query session）
      try {
        await controller.loadRequest(
          Uri.parse(buildGenesis50AuthedUrl(widget.url, session)),
        );
      } catch (_) {
        _loadWatchdog?.cancel();
        if (!mounted) return;
        setState(() {
          _loading = false;
          _error = '页面加载失败，请检查网络后重试';
        });
      }
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
                            _blankProbeDone = false;
                          });
                          if (widget.genesis50) {
                            setState(() => _authPhase = true);
                            unawaited(_openGenesis50());
                          } else {
                            unawaited(_startWebView(widget.url));
                          }
                        },
                        child: const Text('重试'),
                      ),
                    ],
                  ),
                ),
              ),
            )
          else if (_authPhase || _loading)
            ColoredBox(
              color: AppColors.paper.withValues(
                alpha: _controller == null ? 1 : 0.92,
              ),
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
            ),
        ],
      ),
    );
  }
}
