/// H5 白名单路径（与 PRODUCT §24 / apps/web/lib/h5_whitelist.ts 对齐）。
library;

class H5Whitelist {
  H5Whitelist._();

  static const prefixes = <String>[
    '/discover',
    '/campaigns',
    '/campaign',
    '/help',
    '/feedback',
    '/legal',
    '/terms',
    '/privacy',
    '/report',
    '/profile/',
    '/settings',
    '/friend',
    '/group',
  ];

  static bool allows(String path) {
    final p = path.split('?').first;
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
