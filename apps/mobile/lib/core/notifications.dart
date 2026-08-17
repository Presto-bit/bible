/// 本地通知：每日读经提醒（定时重复）+ payload 深链回调。
///
/// 仅在移动端（iOS/Android）生效；Web/桌面为 no-op。远程推送（APNs/FCM）
/// 需平台凭证与原生配置，后续接入；本地通知无需服务端即可投递。
library;

import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:timezone/data/latest_all.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

typedef NotificationPayloadHandler = void Function(String? payload);

class NotificationService {
  NotificationService._();
  static final NotificationService instance = NotificationService._();

  final FlutterLocalNotificationsPlugin _plugin =
      FlutterLocalNotificationsPlugin();
  bool _ready = false;
  static const int _dailyId = 1001;
  static const int _groupId = 1002;
  NotificationPayloadHandler? onPayload;

  bool get _supported =>
      !kIsWeb &&
      (defaultTargetPlatform == TargetPlatform.iOS ||
          defaultTargetPlatform == TargetPlatform.android);

  Future<void> _ensureInit() async {
    if (_ready || !_supported) return;
    tzdata.initializeTimeZones();
    const android = AndroidInitializationSettings('@mipmap/ic_launcher');
    const ios = DarwinInitializationSettings();
    await _plugin.initialize(
      const InitializationSettings(android: android, iOS: ios),
      onDidReceiveNotificationResponse: (resp) {
        onPayload?.call(resp.payload);
      },
    );
    _ready = true;
  }

  Future<bool> requestPermission() async {
    if (!_supported) return false;
    await _ensureInit();
    if (defaultTargetPlatform == TargetPlatform.iOS) {
      final ok = await _plugin
          .resolvePlatformSpecificImplementation<
            IOSFlutterLocalNotificationsPlugin
          >()
          ?.requestPermissions(alert: true, badge: true, sound: true);
      return ok ?? false;
    }
    final android = _plugin
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >();
    final ok = await android?.requestNotificationsPermission();
    return ok ?? true;
  }

  /// [payload] 为 go_router 可用 path，如 `/reader` 或 `/discover/dm/x`。
  Future<void> scheduleDaily(
    int hour,
    int minute, {
    String payload = '/',
  }) async {
    await scheduleReminder(
      kind: 'daily',
      hour: hour,
      minute: minute,
      title: '彼爱 · 今日读经',
      body: '愿话语成为你脚前的灯，点开继续今天的阅读。',
      payload: payload,
    );
  }

  Future<void> cancelDaily() => cancelReminder('daily');

  /// H5 / 壳共用：`daily` 读经提醒，`group` 群晚间打卡。
  Future<void> scheduleReminder({
    required String kind,
    required int hour,
    required int minute,
    String title = '',
    String body = '',
    String payload = '/',
  }) async {
    if (!_supported) return;
    await _ensureInit();
    final id = kind == 'group' ? _groupId : _dailyId;
    final channelId = kind == 'group' ? 'group_reminder' : 'daily_reminder';
    final channelName = kind == 'group' ? '群打卡提醒' : '每日读经提醒';
    final resolvedTitle = title.trim().isEmpty
        ? (kind == 'group' ? '群打卡提醒' : '彼爱 · 今日读经')
        : title.trim();
    final resolvedBody = body.trim().isEmpty
        ? (kind == 'group' ? '还在等你轻轻完成今天的打卡。' : '愿话语成为你脚前的灯，点开继续今天的阅读。')
        : body.trim();
    final resolvedPayload = payload.trim().isEmpty
        ? (kind == 'group' ? '/discover' : '/')
        : payload.trim();

    await _plugin.cancel(id);
    await _plugin.zonedSchedule(
      id,
      resolvedTitle,
      resolvedBody,
      _nextInstance(hour.clamp(0, 23), minute.clamp(0, 59)),
      NotificationDetails(
        android: AndroidNotificationDetails(
          channelId,
          channelName,
          channelDescription: kind == 'group' ? '群晚间打卡本地提醒' : '每天固定时间提醒读经',
          importance: Importance.defaultImportance,
          priority: Priority.defaultPriority,
        ),
        iOS: const DarwinNotificationDetails(),
      ),
      androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
      matchDateTimeComponents: DateTimeComponents.time,
      payload: resolvedPayload,
    );
  }

  Future<void> cancelReminder(String kind) async {
    if (!_supported) return;
    await _ensureInit();
    await _plugin.cancel(kind == 'group' ? _groupId : _dailyId);
  }

  /// 冷启动时检查是否从通知点开。
  Future<String?> consumeLaunchPayload() async {
    if (!_supported) return null;
    await _ensureInit();
    final details = await _plugin.getNotificationAppLaunchDetails();
    if (details?.didNotificationLaunchApp == true) {
      return details!.notificationResponse?.payload;
    }
    return null;
  }

  tz.TZDateTime _nextInstance(int hour, int minute) {
    final now = tz.TZDateTime.now(tz.local);
    var scheduled = tz.TZDateTime(
      tz.local,
      now.year,
      now.month,
      now.day,
      hour,
      minute,
    );
    if (scheduled.isBefore(now)) {
      scheduled = scheduled.add(const Duration(days: 1));
    }
    return scheduled;
  }
}
