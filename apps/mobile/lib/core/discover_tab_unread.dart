/// 底栏「发现」未读：轻量 `/social/unread-count`，与 Web 同源。
library;

import 'dart:async';
import 'dart:math' as math;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api_client.dart';
import 'client_defaults.dart';

String? formatDiscoverTabBadge(int count) {
  final n = math.max(0, count);
  if (n <= 0) return null;
  if (n >= 100) return '99+';
  return '$n';
}

final discoverTabUnreadProvider =
    NotifierProvider<DiscoverTabUnreadNotifier, int>(
  DiscoverTabUnreadNotifier.new,
);

final discoverTabBadgeProvider = Provider<String?>((ref) {
  return formatDiscoverTabBadge(ref.watch(discoverTabUnreadProvider));
});

class DiscoverTabUnreadNotifier extends Notifier<int> {
  Timer? _poll;
  var _badgeEnabled = true;

  @override
  int build() {
    ref.onDispose(() => _poll?.cancel());
    Future.microtask(_bootstrap);
    return 0;
  }

  Future<void> _bootstrap() async {
    final dio = ref.read(dioProvider);
    final defaults = await fetchClientDefaults(dio: dio);
    _badgeEnabled = defaults.tabBarUnreadBadge;
    await refresh();
    _poll?.cancel();
    _poll = Timer.periodic(const Duration(seconds: 45), (_) => refresh());
  }

  Future<void> refresh() async {
    if (!_badgeEnabled) {
      state = 0;
      return;
    }
    try {
      final res = await ref
          .read(dioProvider)
          .get<Map<String, dynamic>>('/social/unread-count');
      final raw = res.data?['unread'];
      final n = raw is num ? raw.toInt() : int.tryParse('$raw') ?? 0;
      state = math.max(0, n);
    } catch (_) {
      // 静默：角标失败不挡导航
    }
  }
}