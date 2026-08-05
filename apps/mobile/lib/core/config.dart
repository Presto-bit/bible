/// 运行期配置。基址可通过 --dart-define=API_BASE_URL / WEB_BASE_URL 覆盖。
///
/// 生产默认同 Web：`https://2sc.prestoai.cn`（API 与 H5 同 origin）。
/// Debug 未传 define 时走本机 8011，便于模拟器联调。
library;

import 'package:flutter/foundation.dart';

class AppConfig {
  static const String _override = String.fromEnvironment('API_BASE_URL');
  static const String _webOverride = String.fromEnvironment('WEB_BASE_URL');

  /// 生产 API / H5 共用基址（与 apps/web `API_BASE` 默认一致）。
  static const String prodBaseUrl = 'https://2sc.prestoai.cn';

  /// H5 / PWA 入口。
  static const String defaultWebBaseUrl = prodBaseUrl;

  /// 历史路径备注（部分部署曾在 /2sc 子路径）。
  static const String webEntryPath = '/2sc';

  static String get baseUrl {
    if (_override.isNotEmpty) {
      return _override.replaceAll(RegExp(r'/$'), '');
    }
    // Release / profile 默认生产；debug 指本机后端
    if (kReleaseMode) return prodBaseUrl;
    const port = 8011;
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
      return 'http://10.0.2.2:$port';
    }
    return 'http://127.0.0.1:$port';
  }

  /// 嵌 H5 的 origin（无末尾斜杠）。
  static String get webBaseUrl {
    if (_webOverride.isNotEmpty) {
      return _webOverride.replaceAll(RegExp(r'/$'), '');
    }
    if (kReleaseMode) return defaultWebBaseUrl;
    // Debug：H5 仍可用生产站，或与 API 同源（define 覆盖）
    return defaultWebBaseUrl;
  }

  /// 构造白名单 H5 URL，附带 Flutter 壳标记与可选 token / 主题。
  static Uri h5Uri(
    String path, {
    String? token,
    String? themeId,
    double? shellInsetTop,
  }) {
    final p = path.startsWith('/') ? path : '/$path';
    final base = Uri.parse('$webBaseUrl$p');
    final q = <String, String>{
      'peiai_flutter': '1',
      if (token != null && token.isNotEmpty) 'peiai_ft_token': token,
      if (themeId != null && themeId.isNotEmpty) 'peiai_theme': themeId,
      if (shellInsetTop != null && shellInsetTop > 0)
        'peiai_inset_top': shellInsetTop.round().toString(),
    };
    return base.replace(
      queryParameters: {
        ...base.queryParameters,
        ...q,
      },
    );
  }

  static const int guestDailyAiLimit = 10;
}
