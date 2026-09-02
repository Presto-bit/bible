/// 应用骨架：底部导航（首页 / 圣经 / 小爱 / 发现 / 我的）。
/// 底栏：PWA 式浮动胶囊 + 轻量毛玻璃；读经沉浸滑出。
library;

import 'dart:async';
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/background_digest_service.dart';
import '../core/discover_warmup.dart';
import '../core/api_client.dart';
import '../core/app_update.dart';
import '../core/app_update_dialog.dart';
import '../core/sync/sync_controller.dart';
import '../features/assistant/assistant_screen.dart';
import '../features/bible/offline_notice.dart'
    show OfflineStatusBar, networkOkProvider;
import '../features/bible/reading_repository.dart' show markReaderTabEntry;
import '../features/bible/reader_screen.dart';
import '../features/home/home_screen.dart';
import '../core/widgets/lazy_indexed_stack.dart';
import '../features/social/discover_screen.dart';
import 'profile_screen.dart';

class NavIndexNotifier extends Notifier<int> {
  @override
  int build() => 0;
  void set(int i) {
    if (i == 1 && state != 1) {
      markReaderTabEntry(ref.read(prefsProvider));
    }
    state = i;
  }
}

final navIndexProvider = NotifierProvider<NavIndexNotifier, int>(
  NavIndexNotifier.new,
);

class ReaderImmersiveNotifier extends Notifier<bool> {
  @override
  bool build() => false;
  void set(bool v) => state = v;
}

final readerImmersiveProvider = NotifierProvider<ReaderImmersiveNotifier, bool>(
  ReaderImmersiveNotifier.new,
);

/// 底栏再次点「圣经」时通知阅读器切换顶栏/沉浸（壳层 → ReaderScreen）。
class ReaderChromeToggleNotifier extends Notifier<int> {
  @override
  int build() => 0;
  void ping() => state++;
}

final readerChromeToggleProvider =
    NotifierProvider<ReaderChromeToggleNotifier, int>(
  ReaderChromeToggleNotifier.new,
);

/// 发现 Tab：私聊 / 群聊全屏时隐藏壳底栏（对齐 iOS PWA 聊天页无底栏）。
class DiscoverImmersiveNotifier extends Notifier<bool> {
  @override
  bool build() => false;
  void set(bool v) {
    if (state == v) return;
    state = v;
  }
}

final discoverImmersiveProvider =
    NotifierProvider<DiscoverImmersiveNotifier, bool>(
      DiscoverImmersiveNotifier.new,
    );

/// 发现 Tab 当前 H5 路径（SPA 与 WebView URL 同步，用于切回 Tab 恢复沉浸）。
class DiscoverH5LocationNotifier extends Notifier<String> {
  @override
  String build() => '/discover';
  void set(String path) {
    final p = path.trim().isEmpty
        ? '/discover'
        : (path.startsWith('/') ? path : '/$path');
    if (state == p) return;
    state = p;
  }
}

final discoverH5LocationProvider =
    NotifierProvider<DiscoverH5LocationNotifier, String>(
      DiscoverH5LocationNotifier.new,
    );

/// 壳层原生列表正在滚动：临时关掉底栏 BackdropFilter，静止后恢复。
class ShellScrollBusyNotifier extends Notifier<bool> {
  @override
  bool build() => false;
  void set(bool v) {
    if (state == v) return;
    state = v;
  }
}

final shellScrollBusyProvider = NotifierProvider<ShellScrollBusyNotifier, bool>(
  ShellScrollBusyNotifier.new,
);

/// 浮动胶囊底栏占位（对齐 PWA `--tabbar-h`）。
///
/// [includeSafe] 为 false 时供已包 `SafeArea` 的原生 Tab 使用。
double peiaiTabBarOverlayExtent(
  BuildContext context, {
  bool includeSafe = true,
}) {
  const inner = 56.0;
  const floatGap = 12.0;
  const breath = 4.0;
  final mq = MediaQuery.of(context);
  // extendBody 下子树 padding.bottom 常被清零，改用 viewPadding。
  final safe = includeSafe
      ? (mq.viewPadding.bottom > mq.padding.bottom
            ? mq.viewPadding.bottom
            : mq.padding.bottom)
      : 0.0;
  return inner + floatGap + safe + breath;
}

/// 壳层在 build 时写入的底栏占位，供圣经 FAB 等子树使用（避免 extendBody 吃掉 inset）。
class PeiaiShellMetrics extends InheritedWidget {
  const PeiaiShellMetrics({
    super.key,
    required this.tabOverlayExtent,
    required super.child,
  });

  final double tabOverlayExtent;

  static PeiaiShellMetrics? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<PeiaiShellMetrics>();

  @override
  bool updateShouldNotify(PeiaiShellMetrics oldWidget) =>
      tabOverlayExtent != oldWidget.tabOverlayExtent;
}

/// 内容区建议底边距：浮栏高度 + 呼吸。
double peiaiTabContentBottomPad(
  BuildContext context, {
  bool includeSafe = true,
}) {
  return peiaiTabBarOverlayExtent(context, includeSafe: includeSafe) + 12;
}

/// 是否为发现私聊 / 群聊路径（隐藏 Flutter 五 Tab）。
bool isDiscoverChatPath(String path) {
  final p = path.split('?').first;
  return p.startsWith('/discover/dm/') || p.startsWith('/discover/group/');
}

void syncDiscoverChromeFromPath(WidgetRef ref, String path) {
  final raw = path.trim().isEmpty
      ? '/discover'
      : (path.startsWith('/') ? path : '/$path');
  ref.read(discoverH5LocationProvider.notifier).set(raw);
  ref
      .read(discoverImmersiveProvider.notifier)
      .set(isDiscoverChatPath(raw.split('?').first));
}

class AppShell extends ConsumerStatefulWidget {
  const AppShell({super.key});

  @override
  ConsumerState<AppShell> createState() => _AppShellState();
}

class _AppShellState extends ConsumerState<AppShell> {
  Timer? _scrollIdle;

  Widget _tabPage(int i) => switch (i) {
        0 => const HomeScreen(),
        1 => const ReaderScreen(),
        2 => const AssistantScreen(),
        3 => const DiscoverScreen(),
        4 => const ProfileScreen(),
        _ => const SizedBox.shrink(),
      };

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _checkForAppUpdate();
      ref.read(backgroundDigestServiceProvider).attach();
      Future<void>.delayed(const Duration(seconds: 2), () {
        if (!mounted) return;
        unawaited(warmupDiscoverResources(ref.read(dioProvider)));
      });
    });
  }

  @override
  void dispose() {
    ref.read(backgroundDigestServiceProvider).detach();
    _scrollIdle?.cancel();
    super.dispose();
  }

  void _onShellScroll(ScrollNotification n) {
    if (n is ScrollStartNotification || n is ScrollUpdateNotification) {
      _scrollIdle?.cancel();
      ref.read(shellScrollBusyProvider.notifier).set(true);
      return;
    }
    if (n is ScrollEndNotification || n is UserScrollNotification) {
      if (n is UserScrollNotification && n.direction != ScrollDirection.idle) {
        _scrollIdle?.cancel();
        ref.read(shellScrollBusyProvider.notifier).set(true);
        return;
      }
      _scrollIdle?.cancel();
      _scrollIdle = Timer(const Duration(milliseconds: 120), () {
        if (!mounted) return;
        ref.read(shellScrollBusyProvider.notifier).set(false);
      });
    }
  }

  Future<void> _checkForAppUpdate() async {
    try {
      final update = await const AppUpdateService().check();
      if (!mounted || update == null) return;
      await showAppUpdateDialog(context: context, update: update);
    } catch (_) {
      // 静默失败：更新检查不应打断读经。
    }
  }

  @override
  Widget build(BuildContext context) {
    final index = ref.watch(navIndexProvider);
    final readerImmersive = ref.watch(readerImmersiveProvider) && index == 1;
    final discoverImmersive =
        ref.watch(discoverImmersiveProvider) && index == 3;
    final immersive = readerImmersive || discoverImmersive;
    final scrolling = ref.watch(shellScrollBusyProvider);
    final theme = Theme.of(context);
    final bg = theme.scaffoldBackgroundColor;
    final safeBottom = MediaQuery.paddingOf(context).bottom;
    // 键盘弹起时不额外叠 safe（与 PWA vv 逻辑一致：优先 keyboard）
    final kb = MediaQuery.viewInsetsOf(context).bottom;
    final barBottomPad = kb > 0 ? 12.0 : (12.0 + safeBottom);
    final online = ref
        .watch(networkOkProvider)
        .maybeWhen(data: (ok) => ok, orElse: () => true);

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
          // 内容滚入毛玻璃底栏下方（对齐 PWA fixed tabbar）
          extendBody: true,
          // 键盘由当前 Tab 内部处理；壳层不整体上推避免 IndexedStack 全动
          resizeToAvoidBottomInset: false,
          body: PeiaiShellMetrics(
            tabOverlayExtent: peiaiTabBarOverlayExtent(context),
            child: Column(
              children: [
                const OfflineStatusBar(),
                Expanded(
                  child: NotificationListener<ScrollNotification>(
                    onNotification: (n) {
                      _onShellScroll(n);
                      return false;
                    },
                    child: LazyIndexedStack(
                      index: index,
                      itemCount: 5,
                      keepAliveOnceVisited: const {3},
                      itemBuilder: _tabPage,
                    ),
                  ),
                ),
              ],
            ),
          ),
          // 沉浸读经时直接移除底栏，不保留 Scaffold 的底部高度，也不做滑出动画。
          bottomNavigationBar: immersive
              ? null
              : _PeiaiCapsuleTabBar(
                  index: index,
                  bottomPadding: barBottomPad,
                  online: online,
                  scrolling: scrolling,
                  onSelect: (i) {
                    // 已在圣经 Tab 时再点一次：切换沉浸/顶栏（对齐 PWA 底栏 re-tap）
                    if (i == index && i == 1) {
                      ref.read(readerChromeToggleProvider.notifier).ping();
                      return;
                    }
                    // 切走圣经 / 发现时清沉浸，避免返回仍是 hidden
                    if (i != 1) {
                      ref.read(readerImmersiveProvider.notifier).set(false);
                    }
                    if (i != 3) {
                      ref.read(discoverImmersiveProvider.notifier).set(false);
                    }
                    ref.read(navIndexProvider.notifier).set(i);
                  },
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
    required this.online,
    required this.scrolling,
  });

  final int index;
  final ValueChanged<int> onSelect;
  final double bottomPadding;
  final bool online;
  final bool scrolling;

  static const _items = <(IconData, IconData, String)>[
    (Icons.home_outlined, Icons.home, '首页'),
    (Icons.menu_book_outlined, Icons.menu_book, '圣经'),
    (Icons.auto_awesome_outlined, Icons.auto_awesome, '小爱'),
    (Icons.chat_bubble_outline, Icons.chat_bubble, '消息'),
    (Icons.person_outline, Icons.person, '我的'),
  ];

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final ink = theme.colorScheme.onSurface;
    final faint = ink.withValues(alpha: 0.45);
    // 对齐 PWA `.tab-active`：选中用 ink。
    final active = ink;
    final fill = theme.colorScheme.surface.withValues(
      alpha: scrolling
          ? (isDark ? 0.88 : 0.92)
          : (isDark ? 0.72 : 0.78),
    );

    final capsule = DecoratedBox(
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
        height: 56,
        child: Row(
          children: [
            for (var i = 0; i < _items.length; i++)
              Expanded(
                child: _TabItem(
                  outline: _items[i].$1,
                  filled: _items[i].$2,
                  label: _items[i].$3,
                  active: index == i,
                  activeColor: active,
                  inactiveColor: faint,
                  dimmed: !online && (i == 2 || i == 3),
                  onTap: () => onSelect(i),
                ),
              ),
          ],
        ),
      ),
    );

    return Material(
      color: Colors.transparent,
      child: Padding(
        padding: EdgeInsets.fromLTRB(16, 0, 16, bottomPadding),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(28),
          child: scrolling
              ? capsule
              : BackdropFilter(
                  filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
                  child: capsule,
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
    this.dimmed = false,
  });

  final IconData outline;
  final IconData filled;
  final String label;
  final bool active;
  final Color activeColor;
  final Color inactiveColor;
  final VoidCallback onTap;
  final bool dimmed;

  @override
  Widget build(BuildContext context) {
    final color = (active ? activeColor : inactiveColor).withValues(
      alpha: dimmed ? 0.38 : 1,
    );
    return Tooltip(
      message: dimmed ? '当前离线，此功能需联网' : '',
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        splashColor: activeColor.withValues(alpha: 0.08),
        highlightColor: activeColor.withValues(alpha: 0.04),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(active ? filled : outline, size: 24, color: color),
            const SizedBox(height: 2),
            Text(
              label,
              style: TextStyle(
                fontSize: 11,
                height: 1.1,
                fontWeight: active ? FontWeight.w600 : FontWeight.w500,
                color: color,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
