/// 应用骨架：底部导航（今日 / 圣经 / 小爱 / 发现 / 我的）。
/// 底栏：对齐 PWA 贴底标准栏 + 轻量毛玻璃；读经沉浸时移除。
library;

import 'dart:async';
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';

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
import '../features/bible/reader_audio.dart' show readerAudioProvider;
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

/// PWA `--tabbar-inner`：贴底标准栏可点区高度（不含 safe）。
const kPeiaiTabBarInner = 52.0;

/// 贴底底栏占位（对齐 PWA `--tabbar-h` = inner + safe）。
///
/// [includeSafe] 为 false 时供已包 `SafeArea` 的原生 Tab 使用。
double peiaiTabBarOverlayExtent(
  BuildContext context, {
  bool includeSafe = true,
}) {
  final mq = MediaQuery.of(context);
  // extendBody 下子树 padding.bottom 常被清零，改用 viewPadding。
  final safe = includeSafe
      ? (mq.viewPadding.bottom > mq.padding.bottom
            ? mq.viewPadding.bottom
            : mq.padding.bottom)
      : 0.0;
  return kPeiaiTabBarInner + safe;
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

/// 发现 Tab 内嵌 H5 需沉浸全屏的路径（IM，对齐 iOS PWA）。
bool isDiscoverImmersiveH5Path(String path) {
  final p = path.split('?').first;
  if (isDiscoverChatPath(p)) return true;
  return false;
}

void syncDiscoverChromeFromPath(WidgetRef ref, String path) {
  final raw = path.trim().isEmpty
      ? '/discover'
      : (path.startsWith('/') ? path : '/$path');
  ref.read(discoverH5LocationProvider.notifier).set(raw);
  ref
      .read(discoverImmersiveProvider.notifier)
      .set(isDiscoverImmersiveH5Path(raw.split('?').first));
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
    final readerAudioFocus =
        ref.watch(readerAudioProvider.select((s) => s.focusOpen)) && index == 1;
    final immersive =
        readerImmersive || discoverImmersive || readerAudioFocus;
    final scrolling = ref.watch(shellScrollBusyProvider);
    final theme = Theme.of(context);
    final bg = theme.scaffoldBackgroundColor;
    final safeBottom = MediaQuery.paddingOf(context).bottom;
    // 键盘弹起时不额外叠 safe（与 PWA vv 逻辑一致：优先 keyboard）
    final kb = MediaQuery.viewInsetsOf(context).bottom;
    final barBottomPad = kb > 0 ? 0.0 : safeBottom;
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
              : _PeiaiTabBar(
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

/// 五 Tab 自绘图标（24×24 evenodd），与 PWA `BottomTabs.tsx` 同一套 path。
const _kTabItems = <({String label, String outline, String filled})>[
  (
    label: '今日',
    outline:
        'M12 3.6L4.2 10.2V19a1.2 1.2 0 001.2 1.2h4.1v-5.4h5V20.2h4.1A1.2 1.2 0 0019.8 19v-8.8L12 3.6zm0 2.3l6.2 5.2V18.6h-2.5v-5.4H8.3v5.4H5.8v-7.5L12 5.9z',
    filled:
        'M12 3.2L3.5 10.3V19a1.4 1.4 0 001.4 1.4h5.1v-5.8h4v5.8h5.1a1.4 1.4 0 001.4-1.4v-8.7L12 3.2z',
  ),
  (
    label: '圣经',
    outline:
        'M3.9 6.15c1.85-.75 4.05-1.15 6.35-1.05.3.02.7.05.95.1v12.7c-.3-.06-.65-.1-1-.1-2.05 0-4.1.4-5.85.95-.45.15-.9-.2-.9-.68V6.9c0-.35.2-.65.45-.75zm1.45 1.55v8.35c1.35-.4 2.9-.65 4.4-.65.2 0 .4 0 .6.02V7.55c-.2-.03-.4-.05-.65-.05-1.55-.05-3.05.2-4.35.7zm14.75-1.55c-.25.1-.45.4-.45.75v10.67c0 .48-.45.83-.9.68-1.75-.55-3.8-.95-5.85-.95-.35 0-.7.04-1 .1V5.2c.25-.05.65-.08.95-.1 2.3-.1 4.5.3 6.35 1.05zm-1.45 1.55c-1.3-.5-2.8-.75-4.35-.7-.25 0-.45.02-.65.05v7.87c.2-.02.4-.02.6-.02 1.5 0 3.05.25 4.4.65V7.7zM11.2 4.45h1.6v15.1h-1.6V4.45zM6.35 9.4h2.9v1.05h-2.9V9.4zm0 2.45h2.2v1.05h-2.2v-1.05zm8.4-2.45h2.9v1.05h-2.9V9.4zm.7 2.45h2.2v1.05h-2.2v-1.05z',
    filled:
        'M4 5.9c1.9-.8 4.2-1.2 6.55-1.05.35.02.8.06 1.1.12v12.95c-.35-.08-.75-.12-1.15-.12-2.15 0-4.35.4-6.2 1-.5.17-1-.22-1-.75V6.7c0-.4.23-.74.5-.85.07-.02.13-.03.2-.03zm8.35-.08c.3-.06.75-.1 1.1-.12 2.35-.15 4.65.25 6.55 1.05.27.11.5.45.5.85v10.35c0 .53-.5.92-1 .75-1.85-.6-4.05-1-6.2-1-.4 0-.8.04-1.15.12V5.82zM11.05 4.35h1.9v15.5h-1.9V4.35z',
  ),
  (
    label: '小爱',
    outline:
        'M5.2 6.4h11.6A2.6 2.6 0 0119.4 9v6.4a2.6 2.6 0 01-2.6 2.6h-3.95l-2.9 2.45a.65.65 0 01-1.07-.5v-1.95H5.2A2.6 2.6 0 012.6 15.4V9a2.6 2.6 0 012.6-2.6zm0 1.4c-.66 0-1.2.54-1.2 1.2v6.4c0 .66.54 1.2 1.2 1.2h3.05v1.7l1.95-1.7h5.65c.66 0 1.2-.54 1.2-1.2V9c0-.66-.54-1.2-1.2-1.2H5.2zM18.85 2.55l.7 2.05 2.05.7-2.05.7-.7 2.05-.7-2.05-2.05-.7 2.05-.7.7-2.05z',
    filled:
        'M5.2 6.15h11.6A2.85 2.85 0 0119.65 9v6.4a2.85 2.85 0 01-2.85 2.85h-3.7l-3.15 2.65a.8.8 0 01-1.3-.62v-2.03H5.2A2.85 2.85 0 012.35 15.4V9a2.85 2.85 0 012.85-2.85zM18.85 2.35l.85 2.35 2.35.85-2.35.85-.85 2.35-.85-2.35-2.35-.85 2.35-.85.85-2.35z',
  ),
  (
    label: '发现',
    outline:
        'M12 3.15a8.85 8.85 0 100 17.7 8.85 8.85 0 000-17.7zm0 1.45a7.4 7.4 0 110 14.8 7.4 7.4 0 010-14.8zM18.2 5.7L14.55 11.15 5.8 18.3 9.45 12.85 18.2 5.7zM12 10.55a1.4 1.4 0 11-.02 2.8A1.4 1.4 0 0112 10.55z',
    filled:
        'M12 2.75a9.25 9.25 0 100 18.5 9.25 9.25 0 000-18.5zM18.35 5.55L14.6 11.2 5.65 18.45 9.4 12.8 18.35 5.55zM12 10.55a1.4 1.4 0 100 2.8 1.4 1.4 0 000-2.8z',
  ),
  (
    label: '我的',
    outline:
        'M12 4.2a3.8 3.8 0 110 7.6 3.8 3.8 0 010-7.6zm0 1.5a2.3 2.3 0 100 4.6 2.3 2.3 0 000-4.6zM6.2 18.1c.35-1.85 2.85-3.1 5.8-3.1s5.45 1.25 5.8 3.1H6.2zm-1.55.35C5.1 16.2 8.15 14.5 12 14.5s6.9 1.7 7.35 3.95c.1.45-.25.85-.7.85H5.35c-.45 0-.8-.4-.7-.85z',
    filled:
        'M12 4a4 4 0 110 8 4 4 0 010-8zm0 10c3.95 0 7.15 1.75 7.55 4.15.1.55-.3 1.05-.85 1.05H5.3c-.55 0-.95-.5-.85-1.05C4.85 15.75 8.05 14 12 14z',
  ),
];

String _tabSvg(String d) =>
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">'
    '<path fill="#000" fill-rule="evenodd" d="$d"/></svg>';

/// 贴底标准栏（对齐 PWA `nav.tabbar`）：全宽、顶部细线、92% 底 + 毛玻璃。
class _PeiaiTabBar extends StatelessWidget {
  const _PeiaiTabBar({
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

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final ink = theme.colorScheme.onSurface;
    final active =
        theme.navigationBarTheme.labelTextStyle
            ?.resolve({WidgetState.selected})
            ?.color ??
        theme.colorScheme.primary;
    final faint = ink.withValues(alpha: isDark ? 0.53 : 0.45);
    final fill = theme.colorScheme.surface.withValues(
      alpha: scrolling ? 0.98 : (isDark ? 0.94 : 0.92),
    );
    final borderTop = isDark
        ? Colors.white.withValues(alpha: 0.12)
        : ink.withValues(alpha: 0.08);

    final bar = DecoratedBox(
      decoration: BoxDecoration(
        color: fill,
        border: Border(top: BorderSide(color: borderTop)),
      ),
      child: Padding(
        padding: EdgeInsets.only(top: 4, bottom: bottomPadding),
        child: SizedBox(
          height: kPeiaiTabBarInner - 4,
          child: Row(
            children: [
              for (var i = 0; i < _kTabItems.length; i++)
                Expanded(
                  child: _TabItem(
                    outlineSvg: _tabSvg(_kTabItems[i].outline),
                    filledSvg: _tabSvg(_kTabItems[i].filled),
                    label: _kTabItems[i].label,
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
      ),
    );

    return Material(
      color: Colors.transparent,
      child: ClipRect(
        child: scrolling
            ? bar
            : BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
                child: bar,
              ),
      ),
    );
  }
}

class _TabItem extends StatefulWidget {
  const _TabItem({
    required this.outlineSvg,
    required this.filledSvg,
    required this.label,
    required this.active,
    required this.activeColor,
    required this.inactiveColor,
    required this.onTap,
    this.dimmed = false,
  });

  final String outlineSvg;
  final String filledSvg;
  final String label;
  final bool active;
  final Color activeColor;
  final Color inactiveColor;
  final VoidCallback onTap;
  final bool dimmed;

  @override
  State<_TabItem> createState() => _TabItemState();
}

class _TabItemState extends State<_TabItem> {
  var _pressed = false;

  @override
  Widget build(BuildContext context) {
    final color = (widget.active ? widget.activeColor : widget.inactiveColor)
        .withValues(alpha: widget.dimmed ? 0.55 : 1);
    final filter = ColorFilter.mode(color, BlendMode.srcIn);
    const iconDur = Duration(milliseconds: 150);
    return Tooltip(
      message: widget.dimmed ? '当前离线，此功能需联网' : '',
      child: AnimatedScale(
        scale: _pressed ? 0.92 : 1,
        duration: const Duration(milliseconds: 120),
        curve: Curves.easeOut,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTapDown: (_) => setState(() => _pressed = true),
          onTapUp: (_) => setState(() => _pressed = false),
          onTapCancel: () => setState(() => _pressed = false),
          onTap: widget.onTap,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              SizedBox(
                width: 24,
                height: 24,
                child: Stack(
                  children: [
                    // 线框 ↔ 实心双层叠化（PWA `.tab-icon-outline/filled`）
                    AnimatedOpacity(
                      opacity: widget.active ? 0 : 1,
                      duration: iconDur,
                      child: AnimatedScale(
                        scale: widget.active ? 1.08 : 1,
                        duration: iconDur,
                        child: SvgPicture.string(
                          widget.outlineSvg,
                          width: 24,
                          height: 24,
                          colorFilter: filter,
                        ),
                      ),
                    ),
                    AnimatedOpacity(
                      opacity: widget.active ? 1 : 0,
                      duration: iconDur,
                      child: AnimatedScale(
                        scale: widget.active ? 1 : 0.88,
                        duration: iconDur,
                        child: SvgPicture.string(
                          widget.filledSvg,
                          width: 24,
                          height: 24,
                          colorFilter: filter,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 3),
              AnimatedDefaultTextStyle(
                duration: iconDur,
                style: TextStyle(
                  fontSize: 11,
                  height: 1.2,
                  fontWeight: widget.active ? FontWeight.w600 : FontWeight.w500,
                  color: color,
                ),
                child: Text(
                  widget.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
