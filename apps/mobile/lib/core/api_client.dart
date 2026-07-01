/// Dio 客户端 + Riverpod 装配。
///
/// 统一注入：Authorization: Bearer（登录后）/ X-Guest-Id（游客）。
/// SSE 流式（/ai/chat）单独用 ResponseType.stream，见 assistant_repository。
library;

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'config.dart';
import 'session.dart';

/// 会话单例（应用启动时 override 注入真实实例）。
final sessionProvider = Provider<Session>((ref) {
  throw UnimplementedError('sessionProvider 必须在 main() 中 override');
});

final prefsProvider = Provider<SharedPreferences>((ref) {
  throw UnimplementedError('prefsProvider 必须在 main() 中 override');
});

final dioProvider = Provider<Dio>((ref) {
  final session = ref.watch(sessionProvider);
  final dio = Dio(
    BaseOptions(
      baseUrl: AppConfig.baseUrl,
      connectTimeout: const Duration(seconds: 8),
      receiveTimeout: const Duration(seconds: 60),
      headers: {'Accept': 'application/json'},
    ),
  );
  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = await session.token();
        final userId = session.userId;
        if (token != null && token.isNotEmpty) {
          options.headers['Authorization'] = 'Bearer $token';
        } else if (userId != null && userId.isNotEmpty) {
          // 开发期：orchestrator 未接入时以 X-User-Id 直连
          options.headers['X-User-Id'] = userId;
        }
        if (session.guestId.isNotEmpty) {
          options.headers['X-Guest-Id'] = session.guestId;
        }
        handler.next(options);
      },
    ),
  );
  return dio;
});
