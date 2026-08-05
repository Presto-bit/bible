/// 打开白名单 H5 页面（统一入口，便于深链 / 首页活动共用）。
library;

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'h5_whitelist.dart';

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
  final q = <String, String>{
    'path': pathAndQuery,
    if (title != null && title.isNotEmpty) 'title': title,
  };
  final loc = Uri(path: '/h5', queryParameters: q).toString();
  context.push(loc);
  return true;
}
