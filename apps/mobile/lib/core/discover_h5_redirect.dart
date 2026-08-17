/// 将深链 / 路由重定向到发现 Tab 常驻 WebView，避免叠层 H5HostPage。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../app/app_shell.dart';
import 'h5_bridge_channel.dart';

/// 发现 Tab 内 H5 路径（IM 等）。
bool isDiscoverTabH5Path(String path) {
  final p = path.split('?').first;
  if (p == '/discover' || p.startsWith('/discover/')) return true;
  return false;
}

void openDiscoverH5InTab(WidgetRef ref, GoRouter router, String path) {
  final normalized = path.startsWith('/') ? path : '/$path';
  ref.read(navIndexProvider.notifier).set(3);
  ref.read(discoverH5PathProvider.notifier).go(normalized);
  router.go('/');
}

/// 路由占位：post-frame 切发现 Tab 并回主壳。
class DiscoverH5RedirectPage extends ConsumerStatefulWidget {
  const DiscoverH5RedirectPage({super.key, required this.path});
  final String path;

  @override
  ConsumerState<DiscoverH5RedirectPage> createState() =>
      _DiscoverH5RedirectPageState();
}

class _DiscoverH5RedirectPageState extends ConsumerState<DiscoverH5RedirectPage> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      openDiscoverH5InTab(ref, GoRouter.of(context), widget.path);
    });
  }

  @override
  Widget build(BuildContext context) => const SizedBox.shrink();
}
