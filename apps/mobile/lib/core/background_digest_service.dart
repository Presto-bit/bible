/// 进程存活、WebView 休眠时的 IM 摘要轮询（对齐 Web `push_digest.ts`）。
///
/// 应用被系统杀掉后仍需 FCM；本服务覆盖「后台但未杀进程」场景。
library;

import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../app/app_shell.dart';
import 'api_client.dart';
import 'notif_prefs.dart';
import 'notifications.dart';

class BackgroundDigestService with WidgetsBindingObserver {
  BackgroundDigestService(this._ref);
  final Ref _ref;

  Timer? _timer;
  var _lastKey = '';
  var _attached = false;

  static const _pollInterval = Duration(seconds: 90);

  void attach() {
    if (_attached) return;
    _attached = true;
    WidgetsBinding.instance.addObserver(this);
  }

  void detach() {
    if (!_attached) return;
    _attached = false;
    WidgetsBinding.instance.removeObserver(this);
    _stopPolling();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.inactive) {
      _startPolling();
    } else if (state == AppLifecycleState.resumed) {
      _lastKey = '';
      _stopPolling();
    }
  }

  void _startPolling() {
    if (_timer != null) return;
    _timer = Timer.periodic(_pollInterval, (_) => unawaited(_tick()));
    unawaited(_tick());
  }

  void _stopPolling() {
    _timer?.cancel();
    _timer = null;
  }

  Future<void> _tick() async {
    try {
      final prefs = _ref.read(prefsProvider);
      if (NotifPrefs.readingDnd(prefs)) {
        final tab = _ref.read(navIndexProvider);
        if (tab == 1) return;
      }
      final digest = await _ref.read(dioProvider).get<Map<String, dynamic>>(
        '/social/push/digest',
      );
      final data = digest.data;
      if (data == null) return;
      final body = '${data['body'] ?? ''}'.trim();
      if (body.isEmpty || body == '近期没有需要处理的消息') return;
      final unread = (data['unread'] as num?)?.toInt() ?? 0;
      if (unread <= 0) return;
      final href = '${data['href'] ?? '/discover'}'.trim();
      final openPath = _digestOpenPath(href);
      final tag = openPath.startsWith('/discover/dm/')
          ? 'presto-dm-$openPath'
          : openPath.startsWith('/discover/group/')
          ? 'presto-group-$openPath'
          : 'presto-digest';
      final key = '$tag|$body|$unread';
      if (key == _lastKey) return;
      final ok = await NotificationService.instance.showImDigest(
        title: '${data['title'] ?? '彼爱'}'.trim(),
        body: body,
        payload: openPath,
        tag: tag,
      );
      if (ok) _lastKey = key;
    } catch (e) {
      if (kDebugMode) debugPrint('background digest: $e');
    }
  }

  String _digestOpenPath(String href) {
    if (href.startsWith('http')) {
      try {
        final u = Uri.parse(href);
        return '${u.path}${u.hasQuery ? '?${u.query}' : ''}';
      } catch (_) {}
    }
    return href.startsWith('/') ? href : '/discover';
  }
}

final backgroundDigestServiceProvider = Provider<BackgroundDigestService>((ref) {
  final svc = BackgroundDigestService(ref);
  ref.onDispose(svc.detach);
  return svc;
});
