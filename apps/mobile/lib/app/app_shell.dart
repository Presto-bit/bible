/// 应用骨架：底部导航（首页 / 圣经 / 小爱 / 发现 / 我的）。
/// 底栏：PWA 式浮动胶囊 + 轻量毛玻璃；读经沉浸滑出。
library;

import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/sync/sync_controller.dart';
import '../features/assistant/assistant_screen.dart';
import '../features/bible/reader_screen.dart';
import '../features/home/home_screen.dart';
import '../features/social/discover_screen.dart';
import '../features/bible/offline_notice.dart';
import 'profile_screen.dart';

class NavIndexNotifier extends Notifier<int> {
  @override
  int build() => 0;
  void set(int i) => state = i;
}

final navIndexProvider =
    NotifierProvider<NavIndexNotifier, int>(NavIndexNotifier.new);

class ReaderImmersiveNotifier extends Notifier<bool> {
  @override
  bool build() => false;
  void set(bool v) => state = v;
}

final readerImmersiveProvider =
    NotifierProvider<ReaderImmersiveNotifier, bool>(
        ReaderImmersiveNotifier.new);

class AppShell extends ConsumerStatefulWidget {
  const AppShell({super.key});

  @override
  ConsumerState<AppShell> createState() => _AppShellState();
}

class _AppShellState extends ConsumerState<AppShell> {
  static const _pages = [
    HomeScreen(),
    ReaderScreen(),
    AssistantScreen(),
    DiscoverScreen(),
    ProfileScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    final index = ref.watch(navIndexProvider);
    final immersive = ref.watch(readerImmersiveProvider) && index == 1;
    final theme = Theme.of(context);
    final bg = theme.scaffoldBackgroundColor;
    final safeBottom = MediaQuery.paddingOf(context).bottom;
    // 键盘弹起时不额外叠 safe（与 PWA vv 逻辑一致：优先 keyboard）
    final kb = MediaQuery.viewInsetsOf(context).bottom;
    final barBottomPad = kb > 0 ? 8.0 : (8 + safeBottom.clamp(0.0, 24.0));

    return SyncLifecycle(
      child: AnnotatedRegion<SystemUiOverlayStyle>(
        value: theme.brightness == Brightness.dark
            ? SystemUiOverlayStyle.light.copyWith(
                statusBarColor: Colors.transparent,
                systemNavigationBarColor: bg,
              )
            : SystemUiOverlayStyle.dark.copyWith(
                statusBarColor: Colors.transparent,
                systemNavigationBarColor: bg,
              ),
        child: Scaffold(
          backgroundColor: bg,
          // 键盘由当前 Tab 内部处理；壳层不整体上推避免 IndexedStack 全动
          resizeToAvoidBottomInset: false,
          body: Column(
            children: [
              const OfflineStatusBar(),
              Expanded(
                child: IndexedStack(index: index, children: _pages),
              ),
            ],
          ),
          bottomNavigationBar: AnimatedSlide(
            duration: const Duration(milliseconds: 320),
            curve: Curves.easeInOutCubic,
            offset: immersive ? const Offset(0, 1.2) : Offset.zero,
            child: AnimatedOpacity(
              duration: const Duration(milliseconds: 260),
              curve: Curves.easeOut,
              opacity: immersive ? 0 : 1,
              child: IgnorePointer(
                ignoring: immersive,
                child: _PeiaiCapsuleTabBar(
                  index: index,
                  bottomPadding: barBottomPad,
                  onSelect: (i) {
                    // 切走圣经时清沉浸，避免返回仍是 hidden
                    if (i != 1) {
                      ref.read(readerImmersiveProvider.notifier).set(false);
                    }
                    ref.read(navIndexProvider.notifier).set(i);
                  },
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _PeiaiCapsuleTabBar extends StatelessWidget {
  const _PeiaiCapsuleTabBar({
    required this.index,
    required this.onSelect,
    required this.bottomPadding,
  });

  final int index;
  final ValueChanged<int> onSelect;
  final double bottomPadding;

  static const _items = <(IconData, IconData, String)>[
    (Icons.home_outlined, Icons.home, '首页'),
    (Icons.menu_book_outlined, Icons.menu_book, '圣经'),
    (Icons.auto_awesome_outlined, Icons.auto_awesome, '小爱'),
    (Icons.explore_outlined, Icons.explore, '发现'),
    (Icons.person_outline, Icons.person, '我的'),
  ];

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final ink = theme.colorScheme.onSurface;
    final faint = ink.withValues(alpha: 0.45);
    final accent = theme.colorScheme.primary;
    final fill = theme.colorScheme.surface.withValues(alpha: isDark ? 0.72 : 0.78);

    return Material(
      color: Colors.transparent,
      child: Padding(
        padding: EdgeInsets.fromLTRB(16, 0, 16, bottomPadding),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(28),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 18, sigmaY: 18),
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: fill,
                borderRadius: BorderRadius.circular(28),
                border: Border.all(
                  color: isDark
                      ? Colors.white.withValues(alpha: 0.10)
                      : Colors.white.withValues(alpha: 0.65),
                ),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: isDark ? 0.35 : 0.10),
                    blurRadius: 28,
                    offset: const Offset(0, 8),
                  ),
                ],
              ),
              child: SizedBox(
                height: 58,
                child: Row(
                  children: [
                    for (var i = 0; i < _items.length; i++)
                      Expanded(
                        child: _TabItem(
                          outline: _items[i].$1,
                          filled: _items[i].$2,
                          label: _items[i].$3,
                          active: index == i,
                          activeColor: accent,
                          inactiveColor: faint,
                          onTap: () => onSelect(i),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _TabItem extends StatelessWidget {
  const _TabItem({
    required this.outline,
    required this.filled,
    required this.label,
    required this.active,
    required this.activeColor,
    required this.inactiveColor,
    required this.onTap,
  });

  final IconData outline;
  final IconData filled;
  final String label;
  final bool active;
  final Color activeColor;
  final Color inactiveColor;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = active ? activeColor : inactiveColor;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      splashColor: activeColor.withValues(alpha: 0.08),
      highlightColor: activeColor.withValues(alpha: 0.04),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          AnimatedScale(
            scale: active ? 1.05 : 1.0,
            duration: const Duration(milliseconds: 180),
            child: Icon(active ? filled : outline, size: 24, color: color),
          ),
          const SizedBox(height: 3),
          Text(
            label,
            style: TextStyle(
              fontSize: 10,
              height: 1.1,
              fontWeight: active ? FontWeight.w600 : FontWeight.w500,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}
