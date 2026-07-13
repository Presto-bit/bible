/// Dio 客户端 + Riverpod 装配。
library;

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'config.dart';
import 'device_id.dart';
import 'session.dart';
import '../features/auth/auth_api.dart';

final deviceIdentityProvider = Provider<DeviceIdentity>((ref) {
  return DeviceIdentity(ref.watch(prefsProvider));
});

final sessionProvider = Provider<Session>((ref) {
  throw UnimplementedError('sessionProvider 必须在 main() 中 override');
});

final prefsProvider = Provider<SharedPreferences>((ref) {
  throw UnimplementedError('prefsProvider 必须在 main() 中 override');
});

/// 当前生效的 user_code；登录/登出后由 AuthController 刷新，驱动 Drift 换库。
class ActiveUserCode extends Notifier<String> {
  @override
  String build() => ref.read(sessionProvider).effectiveUserCode;

  void syncFromSession() {
    state = ref.read(sessionProvider).effectiveUserCode;
  }
}

final activeUserCodeProvider =
    NotifierProvider<ActiveUserCode, String>(ActiveUserCode.new);

final authApiProvider = Provider<AuthApi>((ref) {
  return AuthApi(
    ref.watch(dioProvider),
    ref.watch(sessionProvider),
    ref.watch(deviceIdentityProvider),
  );
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
        final code = session.effectiveUserCode;
        final device = session.deviceFingerprint;
        if (token != null && token.isNotEmpty) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        if (device.isNotEmpty) {
          options.headers['X-Guest-Id'] = device;
          options.headers['X-Device-Id'] = device;
        }
        if (code.isNotEmpty) {
          options.headers['X-User-Code'] = code;
          options.headers['X-User-Id'] = code;
        }
        handler.next(options);
      },
    ),
  );
  return dio;
});
