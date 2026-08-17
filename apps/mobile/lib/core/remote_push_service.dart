/// 远程推送登记（FCM 就绪后接入；当前持久化 token 供服务端投递扩展）。
library;

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api_client.dart';

const _fcmTokenKey = 'peiai_fcm_token_pending';

class RemotePushService {
  RemotePushService(this._dio, this._prefs);
  final Dio _dio;
  final SharedPreferences _prefs;

  /// 登记 FCM token（需服务端配置 FCM 投递；无 token 时 no-op）。
  Future<void> registerFcmToken(String token) async {
    final t = token.trim();
    if (t.isEmpty) return;
    await _prefs.setString(_fcmTokenKey, t);
    try {
      await _dio.post(
        '/push/fcm-register',
        data: {'token': t, 'platform': 'android_flutter'},
      );
      await _prefs.remove(_fcmTokenKey);
    } catch (e) {
      if (kDebugMode) debugPrint('FCM register deferred: $e');
    }
  }

  /// 登录成功后重试待上传 token。
  Future<void> retryPendingRegistration() async {
    final pending = _prefs.getString(_fcmTokenKey);
    if (pending == null || pending.isEmpty) return;
    await registerFcmToken(pending);
  }

  /// 预留：Firebase 初始化成功后调用。
  Future<void> init() async {
    await retryPendingRegistration();
  }
}

final remotePushServiceProvider = Provider<RemotePushService>((ref) {
  return RemotePushService(ref.read(dioProvider), ref.read(prefsProvider));
});
