/// 打开白名单 H5 页面（统一入口，便于深链 / 首页活动共用）。
library;

import 'dart:async' show unawaited;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'h5_whitelist.dart';
import '../app/app_shell.dart';
import 'campaign_nav.dart';
import 'discover_h5_redirect.dart';
import 'h5_bridge_channel.dart';
import 'overlay_h5.dart';

/// 解析 href / path，可打开则 push `/h5?path=…`，返回是否已处理。
bool openH5IfAllowed(BuildContext context, String href, {String? title}) {
  final raw = href.trim();
  if (raw.isEmpty) return false;
  final uri = Uri.tryParse(raw);
  var pathAndQuery = () {
    if (uri == null) return raw.startsWith('/') ? raw : '/$raw';
    if (uri.hasScheme && uri.host.isNotEmpty) {
      final p = uri.path.isEmpty ? '/' : uri.path;
      final q = uri.hasQuery ? '?${uri.query}' : '';
      return '$p$q';
    }
    return raw.startsWith('/') ? raw : '/$raw';
  }();
  final parsed = Uri.parse(
    pathAndQuery.startsWith('/') ? pathAndQuery : '/$pathAndQuery',
  );
  final pathOnly = H5Whitelist.stripAppBasePath(
    parsed.path.isEmpty ? '/' : parsed.path,
  );
  pathAndQuery = '$pathOnly${parsed.hasQuery ? '?${parsed.query}' : ''}';

  // 书架：Android 原生列表 + 阅读器（对齐 §24，不走叠层 H5）
  if (pathOnly == '/shelf' || pathOnly.startsWith('/shelf/')) {
    context.push(pathAndQuery);
    return true;
  }

  // 设置 / 提醒 / 外观：Flutter 原生
  if (pathOnly == '/profile/settings' ||
      pathOnly == '/profile/reminders' ||
      pathOnly == '/profile/appearance') {
    context.push(pathOnly);
    return true;
  }

  if (!H5Whitelist.allows(pathOnly)) return false;

  // 创世记 50 桥接页走 Custom Tabs（Chrome 内核），不能进叠层 H5 WebView。
  if (isGenesis50BridgeHref(pathAndQuery)) {
    unawaited(openCampaignHref(context, pathAndQuery, title: title));
    return true;
  }

  // 读经回顾 / 故事回顾：WebView 竖滑不跟手，走 Flutter 原生（对齐 PWA 体验）。
  if (pathOnly == '/report' || pathOnly.startsWith('/report/')) {
    context.push(pathAndQuery);
    return true;
  }
  if (pathOnly == '/wrapped' || pathOnly.startsWith('/wrapped/')) {
    context.push(pathAndQuery);
    return true;
  }

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
