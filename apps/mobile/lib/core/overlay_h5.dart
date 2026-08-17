/// 叠层 H5 统一入口：避免 `/h5` 叠 `/h5`，与 PWA 单 SPA 体验对齐。
library;

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// 当前路由是否已是叠层 H5（含 `/h5` 与直连 H5HostPage 路由）。
bool isOverlayH5Location(String location) {
  final loc = location.split('?').first;
  if (loc == '/h5') return true;
  if (loc == '/wrapped' || loc.startsWith('/wrapped/')) return true;
  if (loc == '/friend/add' || loc == '/group/create') return true;
  if (loc == '/legal' ||
      loc == '/profile/licenses' ||
      loc == '/profile/settings' ||
      loc == '/profile/reminders') {
    return true;
  }
  return false;
}

/// 打开白名单叠层 H5；若已在叠层则 **replace** 而非再 push 一层。
void openOverlayH5(
  BuildContext context,
  String pathAndQuery, {
  String? title,
}) {
  final normalized = pathAndQuery.startsWith('/')
      ? pathAndQuery
      : '/$pathAndQuery';
  final q = <String, String>{
    'path': normalized,
    if (title != null && title.isNotEmpty) 'title': title,
  };
  final loc = Uri(path: '/h5', queryParameters: q).toString();
  final router = GoRouter.of(context);
  final current = router.state.matchedLocation;
  if (isOverlayH5Location(current)) {
    router.pushReplacement(loc);
  } else {
    router.push(loc);
  }
}
