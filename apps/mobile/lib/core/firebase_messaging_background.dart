/// FCM 后台/终止态消息处理（须在 main 之前注册）。
library;

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import 'notifications.dart';

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  final data = message.data;
  final notification = message.notification;
  final title = notification?.title ?? data['title'] ?? '彼爱';
  final body = notification?.body ?? data['body'] ?? '';
  final href = data['href'] ?? data['click_action'] ?? '/discover';
  if (body.trim().isEmpty) return;
  try {
    await NotificationService.instance.showImDigest(
      title: title.toString(),
      body: body.toString(),
      payload: href.toString(),
      tag: message.messageId ?? body,
    );
  } catch (e) {
    if (kDebugMode) debugPrint('FCM background notify failed: $e');
  }
}
