/// 发现 Tab WebView 预热：冷启动后预拉 manifest / 发现页，缩短首进 IM 白屏。
library;

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import 'config.dart';

Future<void> warmupDiscoverResources(Dio dio) async {
  final web = AppConfig.webBaseUrl;
  final api = AppConfig.baseUrl;
  final tasks = <Future<void>>[
    _head(dio, '$web/discover'),
    _head(dio, '$api/offline/manifest.json'),
  ];
  await Future.wait(tasks, eagerError: false);
}

Future<void> _head(Dio dio, String url) async {
  try {
    await dio.head(url);
  } catch (e) {
    if (kDebugMode) debugPrint('warmup skip $url: $e');
  }
}
