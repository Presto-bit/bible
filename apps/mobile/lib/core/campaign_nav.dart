/// 活动外链导航（对齐 `apps/web/lib/campaign_nav.ts`）。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:webview_flutter/webview_flutter.dart';

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
/// 创世记 50：先鉴权再打开（对齐 PWA `openGenesis50Authed`）。
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
    // 真外链 / 创世记 50 等 → 全屏 WebView（对齐 PWA 内嵌浏览器）
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => _ExternalBrowserPage(
          url: raw,
          title: title ??
              (isGenesis50Href(raw)
                  ? '创世记 50 天'
                  : uri.host.replaceFirst(RegExp(r'^www\.'), '')),
          genesis50: isGenesis50Href(raw),
        ),
      ),
    );
    return;
  }

  // 兜底
  if (!openH5IfAllowed(context, raw.startsWith('/') ? raw : '/$raw',
      title: title)) {
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

  @override
  void initState() {
    super.initState();
    if (widget.genesis50) {
      _authPhase = true;
      WidgetsBinding.instance.addPostFrameCallback((_) => _openGenesis50());
    } else {
      _startWebView(widget.url);
    }
  }

  Future<void> _openGenesis50() async {
    final name = ref.read(authControllerProvider).displayName?.trim();
    final nick =
        (name != null && name.isNotEmpty && name.length <= 20) ? name : '同行者';
    try {
      final openUrl = await resolveGenesis50OpenUrl(
        widget.url,
        nickname: nick,
      );
      if (!mounted) return;
      setState(() => _authPhase = false);
      _startWebView(openUrl);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _authPhase = false;
        _loading = false;
        _error = '暂时无法打开活动，请检查网络后重试';
      });
    }
  }

  void _startWebView(String url) {
    final controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(AppColors.paper)
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (_) {
            if (mounted) setState(() => _loading = true);
          },
          onPageFinished: (_) {
            if (mounted) setState(() => _loading = false);
          },
          onWebResourceError: (err) {
            if (!(err.isForMainFrame ?? true)) return;
            if (!mounted) return;
            setState(() {
              _loading = false;
              _error ??= '页面加载失败，请检查网络后重试';
            });
          },
        ),
      )
      ..loadRequest(Uri.parse(url));
    setState(() {
      _controller = controller;
      _error = null;
      _loading = true;
    });
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
            Center(
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
                        if (widget.genesis50) {
                          setState(() => _authPhase = true);
                          _openGenesis50();
                        } else {
                          _startWebView(widget.url);
                        }
                      },
                      child: const Text('重试'),
                    ),
                  ],
                ),
              ),
            )
          else if (_authPhase || _loading)
            const Align(
              alignment: Alignment.topCenter,
              child: LinearProgressIndicator(minHeight: 2),
            ),
          if (_authPhase)
            const Center(
              child: Text('正在进入活动…'),
            ),
        ],
      ),
    );
  }
}
