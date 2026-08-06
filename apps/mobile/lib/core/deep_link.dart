/// App Link / 通知 payload → go_router 路径。
///
/// 规则：
/// - 白名单 H5 → `/h5?path=…`（含 /pray、/search/series…）
/// - 原生 Tab 面与既有路由 → 对应 location
/// - 读经/小爱锚点保留 query
library;

import 'h5_whitelist.dart';

class DeepLink {
  DeepLink._();

  /// 将 https://host/... 或 app 内相对 path 转成 go_router location。
  static String? toLocation(Uri? uri) {
    if (uri == null) return null;
    var path = uri.path.isEmpty ? '/' : uri.path;
    // 兼容历史 /2sc 前缀
    if (path.startsWith('/2sc')) {
      path = path.substring(4);
      if (path.isEmpty) path = '/';
    }
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
          if (qp['verse'] != null) 'verse': qp['verse']!,
        }).toString();
      case '/assistant':
      case '/ai':
      case '/xiaoai':
        return Uri(path: '/assistant', queryParameters: {
          if (qp['ref'] != null) 'ref': qp['ref']!,
          if (qp['q'] != null) 'q': qp['q']!,
          if (qp['seed'] != null) 'ref': qp['seed']!,
          if (qp['anchor'] != null) 'ref': qp['anchor']!,
        }).toString();
      case '/profile':
      case '/me':
        return 'peiai://tab/4';
      case '/discover':
        // 根发现用 Tab（壳底栏 + 内嵌 H5）
        if (qp.isEmpty) return 'peiai://tab/3';
        return _h5(uri.replace(path: path));
      case '/notes':
        return '/notes';
    }

    // 故事图册等：优先 H5（勿落入下方 /search/* 原生）
    if (path.startsWith('/search/series')) {
      return _h5(uri.replace(path: path));
    }

    // 白名单 H5（IM / 活动 / 协议 / 设置 / 祷告）
    if (H5Whitelist.allows(path)) {
      return _h5(uri.replace(path: path));
    }

    // 兼容旧群路径
    if (path.startsWith('/group/') && !path.startsWith('/group/create')) {
      final id = path.split('/').where((s) => s.isNotEmpty).last;
      return _h5(Uri(path: '/discover/group/$id', queryParameters: qp));
    }
    if (path.startsWith('/campaign') || path.startsWith('/campaigns')) {
      return _h5(uri.replace(path: path));
    }
    if (path.startsWith('/pray')) {
      return _h5(uri.replace(path: path));
    }
    if (path == '/help' || path == '/feedback') {
      return _h5(uri.replace(path: path));
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
      '/notes',
    };
    if (known.contains(path) ||
        (path.startsWith('/search/') && !path.startsWith('/search/series')) ||
        path.startsWith('/knowledge-bases/')) {
      return uri.hasQuery ? '$path?${uri.query}' : path;
    }

    // 末兜底：白名单前缀模糊匹配后进 H5
    for (final p in H5Whitelist.prefixes) {
      if (path == p || path.startsWith(p)) {
        return _h5(uri.replace(path: path));
      }
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
