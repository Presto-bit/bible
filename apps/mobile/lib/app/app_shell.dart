/// 应用骨架：底部导航（首页 / 圣经 / 小爱 / 发现 / 我的）。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/theme.dart';
import '../features/assistant/assistant_screen.dart';
import '../features/bible/reader_screen.dart';
import '../features/home/home_screen.dart';
import '../features/social/discover_screen.dart';
import 'profile_screen.dart';

/// 当前底部导航选中页（供首页“继续阅读”等跨页跳转使用）。
class NavIndexNotifier extends Notifier<int> {
  @override
  int build() => 0;
  void set(int i) => state = i;
}

final navIndexProvider =
    NotifierProvider<NavIndexNotifier, int>(NavIndexNotifier.new);

/// 阅读器沉浸态：为真时（圣经 Tab 进入阅读 3s 后）底部导航下滑隐藏。
class ReaderImmersiveNotifier extends Notifier<bool> {
  @override
  bool build() => false;
  void set(bool v) => state = v;
}

final readerImmersiveProvider =
    NotifierProvider<ReaderImmersiveNotifier, bool>(
        ReaderImmersiveNotifier.new);

class AppShell extends ConsumerWidget {
  const AppShell({super.key});

  static const _pages = [
    HomeScreen(),
    ReaderScreen(),
    AssistantScreen(),
    DiscoverScreen(),
    ProfileScreen(),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final index = ref.watch(navIndexProvider);
    // 仅在圣经 Tab 阅读且顶栏隐藏时收起底部导航；点按页面恢复。
    final immersive = ref.watch(readerImmersiveProvider) && index == 1;
    return Scaffold(
      body: IndexedStack(index: index, children: _pages),
      bottomNavigationBar: AnimatedSize(
        duration: const Duration(milliseconds: 260),
        curve: Curves.easeOut,
        alignment: Alignment.topCenter,
        child: immersive
            ? const SizedBox(width: double.infinity, height: 0)
            : NavigationBar(
        height: 58,
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
        selectedIndex: index,
        onDestinationSelected: (i) =>
            ref.read(navIndexProvider.notifier).set(i),
        backgroundColor: AppColors.surface,
        indicatorColor: AppColors.accentWash,
        destinations: const [
          NavigationDestination(
              icon: Icon(Icons.home_outlined),
              selectedIcon: Icon(Icons.home),
              label: '首页'),
          NavigationDestination(
              icon: Icon(Icons.menu_book_outlined),
              selectedIcon: Icon(Icons.menu_book),
              label: '圣经'),
          NavigationDestination(
              icon: Icon(Icons.auto_awesome_outlined),
              selectedIcon: Icon(Icons.auto_awesome),
              label: '小爱'),
          NavigationDestination(
              icon: Icon(Icons.explore_outlined),
              selectedIcon: Icon(Icons.explore),
              label: '发现'),
          NavigationDestination(
              icon: Icon(Icons.person_outline),
              selectedIcon: Icon(Icons.person),
              label: '我的'),
        ],
      ),
      ),
    );
  }
}
