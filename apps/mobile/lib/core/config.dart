/// 运行期配置。基址可通过 --dart-define=API_BASE_URL=... 覆盖。
///
/// 默认值按平台取本地后端：
///   - iOS 模拟器 / macOS / Web(Chrome)：127.0.0.1:8000
///   - Android 模拟器：10.0.2.2:8000（指向宿主机回环）
/// 真机或生产请用 --dart-define 指定，例如：
///   flutter run --dart-define=API_BASE_URL=https://prestoai.cn
library;

import 'package:flutter/foundation.dart';

class AppConfig {
  static const String _override = String.fromEnvironment('API_BASE_URL');

  /// 生产基址（服务器域名）。
  static const String prodBaseUrl = 'https://prestoai.cn';

  /// H5 / PWA 入口路径（见产品方案 /2sc）。
  static const String webEntryPath = '/2sc';

  static String get baseUrl {
    if (_override.isNotEmpty) return _override;
    // 本地后端端口（8000 被占用时改 8011）。
    const port = 8011;
    // Android 模拟器用 10.0.2.2 访问宿主回环；其余平台用 127.0.0.1。
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
      return 'http://10.0.2.2:$port';
    }
    return 'http://127.0.0.1:$port';
  }

  /// 游客每日 AI 免费次数（与后端 ai_guest_daily_limit 对齐，仅用于 UI 提示）。
  static const int guestDailyAiLimit = 10;
}
