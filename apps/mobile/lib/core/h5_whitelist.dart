/// H5 白名单路径（与 PRODUCT §24 / apps/web/lib/h5_whitelist.ts 对齐）。
library;

class H5Whitelist {
  H5Whitelist._();

  static const prefixes = <String>[
    '/discover',
    '/campaigns',
    '/campaign',
    '/pray',
    '/search/series',
    '/search/map',
    '/search/timeline',
    '/search/graph',
    '/search/diagrams',
    '/help',
    '/feedback',
    '/legal',
    '/terms',
    '/privacy',
    '/report',
    '/wrapped',
    '/profile/',
    '/settings',
    '/friend',
    '/group',
  ];

  /// 去掉历史 `/2sc` 前缀，得到应用内 path（对齐 PWA `stripAppBasePath`）。
  static String stripAppBasePath(String pathname) {
    var p = pathname.trim();
    if (p.isEmpty) return '/';
    if (!p.startsWith('/')) p = '/$p';
    const bases = ['/2sc'];
    for (final base in bases) {
      if (p == base) return '/';
      if (p.startsWith('$base/')) {
        p = p.substring(base.length);
        if (p.isEmpty) p = '/';
        break;
      }
    }
    return p;
  }

  static bool allows(String path) {
    final p = stripAppBasePath(path.split('?').first);
    final n = p.startsWith('/') ? p : '/$p';
    for (final prefix in prefixes) {
      if (n == prefix || n.startsWith(prefix)) return true;
      if (prefix.endsWith('/') && n == prefix.substring(0, prefix.length - 1)) {
        return true;
      }
    }
    return false;
  }
}
