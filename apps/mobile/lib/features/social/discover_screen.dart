/// 发现 Tab：嵌 Web IM（PRODUCT §24 H5 白名单）。
///
/// 相对 PWA 壳层补强：Tab 回前台重灌 session、离线诚实空态、系统返回优先 H5 历史。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/app_shell.dart' show navIndexProvider;
import '../../core/notifications.dart';
import '../../core/h5_host_page.dart';
import '../bible/offline_notice.dart' show networkOkProvider;

class DiscoverScreen extends ConsumerStatefulWidget {
  const DiscoverScreen({super.key});

  @override
  ConsumerState<DiscoverScreen> createState() => _DiscoverScreenState();
}

class _DiscoverScreenState extends ConsumerState<DiscoverScreen> {
  bool _notificationPermissionRequested = false;

  @override
  Widget build(BuildContext context) {
    final selected = ref.watch(navIndexProvider) == 3;
    if (selected && !_notificationPermissionRequested) {
      _notificationPermissionRequested = true;
      // 在用户进入发现页后才申请 Android 13+ 授权，不在 App 首屏打断阅读。
      WidgetsBinding.instance.addPostFrameCallback((_) {
        NotificationService.instance.requestPermission();
      });
    }
    final online = ref.watch(networkOkProvider).maybeWhen(
          data: (ok) => ok,
          orElse: () => true,
        );
    return H5HostPage(
      path: '/discover',
      embedInTab: true,
      showAppBar: false,
      // 发现 Tab index = 3（壳五栏）
      tabIndex: 3,
      forceOffline: !online,
      offlineTitle: '当前离线',
      offlineBody: '消息与共读需联网。恢复网络后点重试；读经、笔记仍可在圣经 Tab 使用。',
    );
  }
}
