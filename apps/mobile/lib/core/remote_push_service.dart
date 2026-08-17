/// 远程推送：FCM token 登记 + 前台/后台消息 → 本地通知 + 深链。
library;

import 'dart:async';

import 'package:dio/dio.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api_client.dart';
import 'notifications.dart';

const _fcmTokenKey = 'peiai_fcm_token_pending';

typedef PushOpenHandler = void Function(String href);

class RemotePushService {
  RemotePushService(this._dio, this._prefs);
  final Dio _dio;
  final SharedPreferences _prefs;

  PushOpenHandler? onOpenFromPush;
  var _initialized = false;
  StreamSubscription<String>? _tokenRefreshSub;

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
    final live = await FirebaseMessaging.instance.getToken();
    if (live != null && live.isNotEmpty && live != pending) {
      await registerFcmToken(live);
    }
  }

  Future<void> init() async {
    if (_initialized || kIsWeb) return;
    if (defaultTargetPlatform != TargetPlatform.android) return;

    try {
      await Firebase.initializeApp();
    } catch (e) {
      if (kDebugMode) {
        debugPrint('Firebase init skipped (add google-services.json): $e');
      }
      await retryPendingRegistration();
      return;
    }

    await _tokenRefreshSub?.cancel();
    _tokenRefreshSub = FirebaseMessaging.instance.onTokenRefresh.listen(
      registerFcmToken,
      onError: (Object e) {
        if (kDebugMode) debugPrint('FCM token refresh error: $e');
      },
    );

    FirebaseMessaging.onMessage.listen(_onForegroundMessage);
    FirebaseMessaging.onMessageOpenedApp.listen(_onMessageOpened);
    final initial = await FirebaseMessaging.instance.getInitialMessage();
    if (initial != null) {
      _dispatchOpen(initial);
    }

    final settings = await FirebaseMessaging.instance.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );
    if (kDebugMode) {
      debugPrint('FCM permission: ${settings.authorizationStatus}');
    }

    final token = await FirebaseMessaging.instance.getToken();
    if (token != null && token.isNotEmpty) {
      await registerFcmToken(token);
    }

    _initialized = true;
    await retryPendingRegistration();
  }

  void dispose() {
    unawaited(_tokenRefreshSub?.cancel());
    _tokenRefreshSub = null;
  }

  Future<void> _onForegroundMessage(RemoteMessage message) async {
    final data = message.data;
    final notification = message.notification;
    final title = notification?.title ?? data['title'] ?? '彼爱';
    final body = notification?.body ?? data['body'] ?? '';
    final href = data['href'] ?? '/discover';
    if (body.trim().isEmpty) return;
    await NotificationService.instance.showImDigest(
      title: title.toString(),
      body: body.toString(),
      payload: href.toString(),
      tag: message.messageId ?? body,
    );
  }

  void _onMessageOpened(RemoteMessage message) => _dispatchOpen(message);

  void _dispatchOpen(RemoteMessage message) {
    final data = message.data;
    final href = (data['href'] ?? '/discover').toString().trim();
    if (href.isEmpty) return;
    onOpenFromPush?.call(href.startsWith('/') ? href : '/$href');
  }
}

final remotePushServiceProvider = Provider<RemotePushService>((ref) {
  final svc = RemotePushService(ref.read(dioProvider), ref.read(prefsProvider));
  ref.onDispose(svc.dispose);
  return svc;
});
