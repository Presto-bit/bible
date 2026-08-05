/// App Link / 通知 payload → go_router 路径。
///
/// 规则：
/// - 白名单 H5 → `/h5?path=…`
/// - 原生 Tab 面与既有路由 → 对应 location
/// - 读经/小爱锚点保留 query
library;

import 'h5_whitelist.dart';

class DeepLink {
  DeepLink._();

  /// 将 https://host/... 或 app 内相对 path 转成 go_router location。
  static String? toLocation(Uri? uri) {
    if (uri == null) return null;
    final path = uri.path.isEmpty ? '/' : uri.path;
    final qp = Map<String, String>.from(uri.queryParameters);

    // Tab 根
    switch (path) {
      case '/':
      case '/home':
        return '/';
      case '/reader':
      case '/bible':
        return Uri(path: '/reader', queryParameters: {
          if (qp['book'] != null) 'book': qp['book']!,
          if (qp['chapter'] != null) 'chapter': qp['chapter']!,
        }).toString();
      case '/assistant':
      case '/ai':
        return Uri(path: '/assistant', queryParameters: {
          if (qp['ref'] != null) 'ref': qp['ref']!,
          if (qp['q'] != null) 'q': qp['q']!,
          if (qp['seed'] != null) 'ref': qp['seed']!,
        }).toString();
      case '/profile':
        return '/';
      case '/discover':
        // 发现 Tab 在壳内，深链进独立页也可用
        if (H5Whitelist.allows(path) || path == '/discover') {
          return _h5(uri);
        }
        return '/discover';
    }

    // IM 子路由：统一走 H5
    if (H5Whitelist.allows(path)) {
      return _h5(uri);
    }

    // 兼容旧路由
    if (path.startsWith('/group/')) {
      final id = path.split('/').last;
      return _h5(Uri(path: '/discover/group/$id', queryParameters: qp));
    }
    if (path.startsWith('/discover/dm/') ||
        path.startsWith('/discover/group/')) {
      return _h5(uri);
    }
    if (path.startsWith('/report')) {
      return _h5(uri);
    }
    if (path.startsWith('/campaigns')) {
      return _h5(uri);
    }
    if (path.startsWith('/friend') || path.startsWith('/group/create')) {
      return _h5(uri);
    }

    // 已知原生
    const known = {
      '/plans',
      '/plans/generate',
      '/challenge',
      '/challenge/ai',
      '/dictionary',
      '/search',
      '/wrapped',
      '/knowledge-bases',
      '/profile/appearance',
    };
    if (known.contains(path) ||
        path.startsWith('/search/') ||
        path.startsWith('/knowledge-bases/')) {
      return uri.hasQuery ? '$path?${uri.query}' : path;
    }

    return null;
  }

  /// 纯 payload 字符串（通知里可能写 `/reader?book=JHN`）。
  static String? fromPayload(String? payload) {
    if (payload == null || payload.trim().isEmpty) return null;
    final t = payload.trim();
    if (t.startsWith('http://') || t.startsWith('https://')) {
      return toLocation(Uri.tryParse(t));
    }
    final u = Uri.tryParse(t.startsWith('/') ? t : '/$t');
    return toLocation(u);
  }

  static String _h5(Uri uri) {
    final path = uri.path.isEmpty ? '/' : uri.path;
    final full = uri.hasQuery ? '$path?${uri.query}' : path;
    return Uri(
      path: '/h5',
      queryParameters: {'path': full},
    ).toString();
  }
}
