/// 社交近实时：轮询 /social/realtime/cursor，变化时刷新会话与未读。
library;

import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'social_repository.dart';

class SocialChangeFlags {
  const SocialChangeFlags({
    this.group = false,
    this.dm = false,
    this.seq = 0,
  });
  final bool group;
  final bool dm;
  final int seq;

  bool get any => group || dm;
}

class SocialRealtimeNotifier extends Notifier<SocialChangeFlags> {
  Timer? _timer;
  String _lastGroup = '';
  String _lastDm = '';
  var _busy = false;
  AppLifecycleListener? _lifecycle;

  @override
  SocialChangeFlags build() {
    _lifecycle = AppLifecycleListener(
      onResume: () => unawaited(_poll()),
    );
    _timer = Timer.periodic(const Duration(seconds: 2), (_) {
      unawaited(_poll());
    });
    ref.onDispose(() {
      _timer?.cancel();
      _lifecycle?.dispose();
    });
    Future.microtask(() => unawaited(_poll()));
    return const SocialChangeFlags();
  }

  Future<void> _poll() async {
    if (_busy) return;
    _busy = true;
    try {
      final cur = await ref.read(socialRepoProvider).realtimeCursor();
      final g = (cur['group_max'] ?? '').toString();
      final d = (cur['dm_max'] ?? '').toString();
      final group = _lastGroup.isNotEmpty && g != _lastGroup;
      final dm = _lastDm.isNotEmpty && d != _lastDm;
      if (g.isNotEmpty) _lastGroup = g;
      if (d.isNotEmpty) _lastDm = d;
      if (!group && !dm) return;
      state = SocialChangeFlags(
        group: group,
        dm: dm,
        seq: state.seq + 1,
      );
      ref.invalidate(conversationsProvider);
      ref.invalidate(discoverSummaryProvider);
    } catch (_) {
      /* 离线/未登录时忽略 */
    } finally {
      _busy = false;
    }
  }
}

final socialRealtimeProvider =
    NotifierProvider<SocialRealtimeNotifier, SocialChangeFlags>(
  SocialRealtimeNotifier.new,
);
