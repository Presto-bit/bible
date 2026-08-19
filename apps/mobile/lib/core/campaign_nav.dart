/// 活动外链导航（对齐 `apps/web/lib/campaign_nav.ts`）。
library;

import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

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

String _titleFromExternalUrl(String url) {
  try {
    return Uri.parse(url).host.replaceFirst(RegExp(r'^www\.'), '');
  } catch (_) {
    return '外部页面';
  }
}

Future<void> _openCustomTabLauncher(
  BuildContext context, {
  required String title,
  required Future<String> Function() resolveUrl,
  required String loadingMessage,
  required String failureMessage,
}) async {
  await Navigator.of(context).push(
    MaterialPageRoute<void>(
      builder: (_) => _CustomTabLauncherPage(
        title: title,
        resolveUrl: resolveUrl,
        loadingMessage: loadingMessage,
        failureMessage: failureMessage,
      ),
    ),
  );
}

/// 创世记 50：Flutter 鉴权 + Chrome Custom Tabs。
Future<void> _openGenesis50External(
  BuildContext context, {
  required String href,
  String? title,
}) async {
  final target = _genesis50Target(href);
  await _openCustomTabLauncher(
    context,
    title: title ?? '创世记 50 天',
    loadingMessage: '正在进入活动…',
    failureMessage: '进入活动失败，请检查网络后重试',
    resolveUrl: () => resolveGenesis50OpenUrl(target),
  );
}

/// 真外域 http(s)：Chrome Custom Tabs（不用 WebView 嵌跨站页）。
Future<void> _openExternalCustomTab(
  BuildContext context, {
  required String url,
  String? title,
}) async {
  final pageTitle = title ?? _titleFromExternalUrl(url);
  await _openCustomTabLauncher(
    context,
    title: pageTitle,
    loadingMessage: '正在打开…',
    failureMessage: '无法打开链接，请确认已安装 Chrome 或其他浏览器',
    resolveUrl: () async => url,
  );
}

/// 打开活动 / 推荐卡链接：站内 H5 或原生路由；真外链 Custom Tabs。
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
    await _openExternalCustomTab(context, url: raw, title: title);
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

/// 鉴权 / 解析 URL → Custom Tabs → 返回彼爱。
class _CustomTabLauncherPage extends StatefulWidget {
  const _CustomTabLauncherPage({
    required this.title,
    required this.resolveUrl,
    required this.loadingMessage,
    required this.failureMessage,
  });

  final String title;
  final Future<String> Function() resolveUrl;
  final String loadingMessage;
  final String failureMessage;

  @override
  State<_CustomTabLauncherPage> createState() => _CustomTabLauncherPageState();
}

class _CustomTabLauncherPageState extends State<_CustomTabLauncherPage> {
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
      final url = await widget.resolveUrl();
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
        _error = '无法打开页面，请确认已安装 Chrome 或其他浏览器';
      });
    } catch (e) {
      if (kDebugMode) debugPrint('custom tab launch: $e');
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = widget.failureMessage;
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
        _error = '无法打开页面，请确认已安装 Chrome 或其他浏览器';
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
                Text(widget.loadingMessage),
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
