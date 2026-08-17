/// 打开白名单 H5 页面（统一入口，便于深链 / 首页活动共用）。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'h5_whitelist.dart';
import '../app/app_shell.dart';
import 'discover_h5_redirect.dart';
import 'h5_bridge_channel.dart';
import 'overlay_h5.dart';

/// 解析 href / path，可打开则 push `/h5?path=…`，返回是否已处理。
bool openH5IfAllowed(
  BuildContext context,
  String href, {
  String? title,
}) {
  final raw = href.trim();
  if (raw.isEmpty) return false;
  final uri = Uri.tryParse(raw);
  final pathAndQuery = () {
    if (uri == null) return raw.startsWith('/') ? raw : '/$raw';
    if (uri.hasScheme && uri.host.isNotEmpty) {
      final p = uri.path.isEmpty ? '/' : uri.path;
      final q = uri.hasQuery ? '?${uri.query}' : '';
      return '$p$q';
    }
    return raw.startsWith('/') ? raw : '/$raw';
  }();
  final pathOnly = pathAndQuery.split('?').first;
  if (!H5Whitelist.allows(pathOnly)) return false;

  // 发现 IM：进 Tab 常驻 WebView，勿叠层 /h5
  if (isDiscoverTabH5Path(pathOnly)) {
    final container = ProviderScope.containerOf(context, listen: false);
    container.read(navIndexProvider.notifier).set(3);
    container.read(discoverH5PathProvider.notifier).go(pathAndQuery);
    context.go('/');
    return true;
  }

  openOverlayH5(context, pathAndQuery, title: title);
  return true;
}
