/// 活动外链导航（对齐 `apps/web/lib/campaign_nav.ts`）。
library;

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:webview_flutter/webview_flutter.dart';

import 'open_h5.dart';
import 'theme.dart';

bool _isAppHostname(String host) {
  final h = host.trim().toLowerCase().replaceFirst(RegExp(r'^www\.'), '');
  if (h.isEmpty) return false;
  return h == '2sc.prestoai.cn' ||
      h == 'prestoai.cn' ||
      h == 'localhost' ||
      h == '127.0.0.1' ||
      h.endsWith('.prestoai.cn');
}

bool isGenesis50Href(String href) {
  final t = href.trim().toLowerCase();
  return t.contains('genesis-50') || t.contains('genesis50');
}

String normalizeCampaignHref(String href) {
  final t = href.trim();
  if (t.isEmpty) return '';
  if (t.startsWith('//')) return 'https:$t';
  return t;
}

/// 打开活动 / 推荐卡链接：站内 H5 或原生路由；真外链（含创世记 50）全屏 WebView。
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

class _ExternalBrowserPage extends StatefulWidget {
  const _ExternalBrowserPage({required this.url, required this.title});
  final String url;
  final String title;

  @override
  State<_ExternalBrowserPage> createState() => _ExternalBrowserPageState();
}

class _ExternalBrowserPageState extends State<_ExternalBrowserPage> {
  late final WebViewController _controller;
  var _loading = true;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
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
        ),
      )
      ..loadRequest(Uri.parse(widget.url));
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
          WebViewWidget(controller: _controller),
          if (_loading)
            const LinearProgressIndicator(minHeight: 2),
        ],
      ),
    );
  }
}
