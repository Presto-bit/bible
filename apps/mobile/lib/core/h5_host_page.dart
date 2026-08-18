/// Flutter 壳内嵌白名单 H5（IM / 活动 / 协议帮助等）。
///
/// 体验：贴近 iOS PWA；URL 早挂 chromemark；主题 token 注入；选图；登出双清注册。
library;

import 'dart:async';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

import '../app/app_shell.dart';
import '../features/assistant/assistant_seed.dart';
import 'api_client.dart';
import 'app_update.dart';
import 'app_update_progress_hub.dart';
import 'app_theme.dart';
import 'config.dart';
import 'h5_bridge_channel.dart';
import 'h5_reading_bridge.dart';
import 'h5_session_bridge.dart';
import 'h5_whitelist.dart';
import 'native_permissions.dart';
import 'notif_prefs.dart';
import 'theme_ext.dart';

// discoverH5PathProvider 来自 h5_bridge_channel.dart

class H5HostPage extends ConsumerStatefulWidget {
  const H5HostPage({
    super.key,
    required this.path,
    this.showAppBar = false,
    this.title,
    this.embedInTab = false,
    this.tabIndex,
    this.forceOffline = false,
    this.offlineTitle = '当前离线',
    this.offlineBody = '此页需联网使用。恢复网络后点重试。',
  });

  final String path;
  final bool showAppBar;
  final String? title;
  final bool embedInTab;

  /// 若为底栏 Tab，在切回此 index 时重灌 session / 视口。
  final int? tabIndex;
  final bool forceOffline;
  final String offlineTitle;
  final String offlineBody;

  @override
  ConsumerState<H5HostPage> createState() => _H5HostPageState();
}

class _H5HostPageState extends ConsumerState<H5HostPage>
    with WidgetsBindingObserver {
  WebViewController? _controller;
  var _loading = true;
  var _hadFirstPaint = false;
  String? _error;
  var _canGoBack = false;
  late String _activePath;
  String _readingHydrateJs = '';

  /// 视图可见高度（键盘弹起时收小），同步给 H5 --im-kb / vv
  double? _viewHeight;
  double? _viewBottomInset;

  /// 无键盘时宿主高度基线（部分机型 adjustResize 下 viewInsets 为 0）
  double? _baselineHostH;
  Timer? _viewportMetricsDebounce;

  /// 祷告页表面色（对齐 `apps/web/styles/pray.css` / PraySession `PRAY_SURFACE`）
  static const _praySurface = Color(0xFFF3EBE3);

  bool get _isPraySurface {
    final p = _activePath.split('?').first;
    return p == '/pray' || p.startsWith('/pray/');
  }

  Color _surfaceBg(AppThemeId themeId) =>
      _isPraySurface ? _praySurface : peiaiPaperFor(themeId);

  @override
  void initState() {
    super.initState();
    _activePath = widget.path.startsWith('/') ? widget.path : '/${widget.path}';
    // 冷启动 / 通知深链可能在发现 WebView 创建前已写入目标路径；
    // `ref.listen` 不会回放旧值，故在此先消费一次，保证能直达私聊/群聊。
    if (widget.embedInTab && widget.tabIndex == 3) {
      final pending = ref.read(discoverH5PathProvider);
      if (pending != null && pending.trim().isNotEmpty) {
        _activePath = pending.startsWith('/') ? pending : '/$pending';
        ref.read(discoverH5PathProvider.notifier).consume();
      }
    }
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) => _bootstrap());
  }

  Future<void> _prepareReadingHydrate(String pathOnly) async {
    if (pathOnly == '/wrapped' ||
        pathOnly.startsWith('/wrapped') ||
        pathOnly == '/report' ||
        pathOnly.startsWith('/report')) {
      try {
        _readingHydrateJs = await buildH5ReadingHydrateJs(ref);
      } catch (_) {
        _readingHydrateJs = '';
      }
    } else {
      _readingHydrateJs = '';
    }
  }

  @override
  void dispose() {
    final c = _controller;
    if (c != null) {
      H5SessionBridge.unregister(c);
      AppUpdateProgressHub.unregister(c);
    }
    _viewportMetricsDebounce?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    // 发现 Tab 销毁时清沉浸，避免底栏卡隐藏
    if (widget.tabIndex == 3) {
      try {
        ref.read(discoverImmersiveProvider.notifier).set(false);
      } catch (_) {}
    }
    super.dispose();
  }

  void _syncDiscoverImmersive([String? urlOrPath]) {
    if (widget.tabIndex != 3) return;
    final raw = (urlOrPath ?? _activePath).trim();
    if (raw.isEmpty) return;
    String pathOnly;
    final parsed = Uri.tryParse(raw);
    if (parsed != null &&
        parsed.hasScheme &&
        (parsed.scheme == 'http' || parsed.scheme == 'https')) {
      pathOnly = parsed.path.isEmpty ? '/' : parsed.path;
      _activePath = '$pathOnly${parsed.hasQuery ? '?${parsed.query}' : ''}';
    } else {
      final path = raw.startsWith('/') ? raw : '/$raw';
      pathOnly = path.split('?').first;
      _activePath = path;
    }
    syncDiscoverChromeFromPath(ref, _activePath);
  }

  bool get _needsBottomSafeInset {
    final p = _activePath.split('?').first;
    return p == '/wrapped' ||
        p.startsWith('/wrapped') ||
        p == '/pray' ||
        p.startsWith('/pray/');
  }

  /// 宿主浮动底栏高度注入 H5（extendBody 后内容需自行垫底）。
  /// 聊天沉浸仍保留底部安全区，避免 composer 贴到 Home Indicator。
  String _tabBarCssJs({bool keyboardUp = false}) {
    final mq = MediaQuery.of(context);
    final safeRaw = mq.viewPadding.bottom > mq.padding.bottom
        ? mq.viewPadding.bottom
        : mq.padding.bottom;
    final chatImmersive =
        isDiscoverChatPath(_activePath) ||
        (widget.tabIndex == 3 && ref.read(discoverImmersiveProvider));
    final useSafeBottom =
        chatImmersive || (!widget.embedInTab && _needsBottomSafeInset);
    final safe = keyboardUp ? 0.0 : (useSafeBottom ? safeRaw : 0.0);
    if (!widget.embedInTab || chatImmersive) {
      return '''
    root.style.setProperty('--shell-inset-bottom', '${safe.toStringAsFixed(1)}px');
    root.style.setProperty('--tabbar-inner', '0px');
    root.style.setProperty('--tabbar-float-gap', '0px');
    root.style.setProperty('--tabbar-safe', '${safe.toStringAsFixed(1)}px');
    root.style.setProperty('--tabbar-h', '0px');
''';
    }
    final h = peiaiTabBarOverlayExtent(context, includeSafe: true);
    return '''
    root.style.setProperty('--shell-inset-bottom', '${safeRaw.toStringAsFixed(1)}px');
    root.style.setProperty('--tabbar-inner', '56px');
    root.style.setProperty('--tabbar-float-gap', '12px');
    root.style.setProperty('--tabbar-safe', '${safeRaw.toStringAsFixed(1)}px');
    root.style.setProperty('--tabbar-h', '${h.toStringAsFixed(1)}px');
''';
  }

  Future<void> _injectTabBarMetrics(WebViewController c) async {
    if (!mounted) return;
    await c.runJavaScript('''
(function(){
  try {
    var root = document.documentElement;
    ${_tabBarCssJs()}
  } catch (e) {}
})();
''');
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _reinjectSession();
    }
  }

  @override
  void didChangeMetrics() {
    // 键盘 resize：把 **WebView 实际可用高度** 注入 H5，贴近 iOS PWA 输入栏贴边
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final mq = MediaQuery.of(context);
      final box = context.findRenderObject() as RenderBox?;
      final h = (box != null && box.hasSize) ? box.size.height : mq.size.height;
      final bottom = mq.viewInsets.bottom;
      if (_viewHeight == h && _viewBottomInset == bottom) return;
      _viewHeight = h;
      _viewBottomInset = bottom;
      _scheduleViewportMetrics();
    });
  }

  void _scheduleViewportMetrics() {
    // 键盘动画会连续触发 metrics；合并跨 WebView JS 调用，取最后一帧高度。
    _viewportMetricsDebounce?.cancel();
    _viewportMetricsDebounce = Timer(
      const Duration(milliseconds: 48),
      () => unawaited(_injectViewportMetrics()),
    );
  }

  Future<void> _reinjectSession() async {
    final c = _controller;
    if (c == null) return;
    final token = await ref.read(sessionProvider).token();
    await _runBridgeJs(c, token);
    await _injectViewportMetrics();
    // IM/发现：回前台时通知 H5 可重拉未读（若页面监听）
    try {
      await c.runJavaScript('''
(function(){
  try {
    window.dispatchEvent(new CustomEvent('peiai-flutter-resume'));
    if (typeof window.__PEIAI_ON_RESUME__ === 'function') window.__PEIAI_ON_RESUME__();
  } catch (e) {}
})();
''');
    } catch (_) {}
  }

  Future<void> _pauseDiscoverRealtime() async {
    final c = _controller;
    if (c == null || widget.tabIndex != 3) return;
    try {
      await c.runJavaScript('''
(function(){
  try { window.dispatchEvent(new CustomEvent('peiai-flutter-pause')); } catch (e) {}
})();
''');
    } catch (_) {}
  }

  @override
  void didUpdateWidget(H5HostPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.forceOffline && !widget.forceOffline) {
      // 弱网恢复：已有 WebView 时只重灌 session，避免整页重载清空 IM
      if (_controller != null) {
        unawaited(_reinjectSession());
      } else {
        setState(() {
          _error = null;
          _loading = true;
        });
        unawaited(_bootstrap());
      }
    }
  }

  Future<void> _injectViewportMetrics() async {
    final c = _controller;
    if (c == null || !mounted) return;
    final mq = MediaQuery.of(context);
    final box = context.findRenderObject() as RenderBox?;
    // 关键：embed 时必须用宿主高度，勿用全屏 size（否则底栏区内容被壳遮挡）
    final hostH = (box != null && box.hasSize)
        ? box.size.height
        : mq.size.height;
    final insetKb = mq.viewInsets.bottom;
    // 部分机型 inset=0 但宿主被顶矮 → 仍视为键盘开
    if (insetKb <= 0) {
      _baselineHostH ??= hostH;
    }
    final shrinkKb = (_baselineHostH != null && hostH < _baselineHostH! - 48)
        ? (_baselineHostH! - hostH)
        : 0.0;
    if (insetKb <= 0 && shrinkKb <= 0) {
      _baselineHostH = hostH;
    }
    // 宿主已因键盘变矮时不再减 inset，避免双重扣除。
    final keyboardUp = insetKb > 0 || shrinkKb > 0;
    final kbInset = insetKb > 0 ? insetKb : shrinkKb;
    final vv = (insetKb > 0 && shrinkKb <= 0)
        ? (hostH - insetKb).clamp(120.0, 4000.0)
        : hostH.clamp(120.0, 4000.0);
    await c.runJavaScript('''
(function(){
  try {
    var root = document.documentElement;
    ${_tabBarCssJs(keyboardUp: keyboardUp)}
    root.style.setProperty('--peiai-vv-h', '${vv.toStringAsFixed(1)}px');
    root.style.setProperty('--im-vv-h', '${vv.toStringAsFixed(1)}px');
    root.style.setProperty('--im-kb-inset', '${kbInset.toStringAsFixed(1)}px');
    if ($keyboardUp) {
      document.body && document.body.classList.add('im-keyboard', 'android-flutter-kb');
    } else {
      document.body && document.body.classList.remove('im-keyboard', 'android-flutter-kb');
    }
  } catch (e) {}
})();
''');
  }

  Future<void> _bootstrap() async {
    if (widget.forceOffline) {
      setState(() {
        _error = widget.offlineBody;
        _loading = false;
      });
      return;
    }
    final path = _activePath.startsWith('/') ? _activePath : '/$_activePath';
    final pathOnly = path.split('?').first;
    if (!H5Whitelist.allows(pathOnly)) {
      setState(() {
        _error = '该页面不在 H5 白名单内';
        _loading = false;
      });
      return;
    }
    await _prepareReadingHydrate(pathOnly);
    if (!mounted) return;

    final themeId = ref.read(appThemeProvider);
    final padTop = MediaQuery.paddingOf(context).top;
    final token = await ref.read(sessionProvider).token();
    if (!mounted) return;
    final uri = AppConfig.h5Uri(
      path,
      token: token,
      themeId: themeId.storageKey,
      shellInsetTop: widget.showAppBar ? 0 : padTop,
    );

    // 先声明再挂 delegate，避免 onPageStarted 闭包引用未初始化的 controller
    final controller = WebViewController();
    controller
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      // 祷告：立刻铺上 #f3ebe3，避免冷启 WebView 白底跳闪（对齐 PWA 同色表面）
      ..setBackgroundColor(_surfaceBg(themeId))
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (url) {
            if (mounted) setState(() => _loading = true);
            // 尽早再推一次 chrome 类，压 Web 双底栏闪现
            unawaited(_runEarlyChrome(controller, token, themeId));
            if (mounted) _syncDiscoverImmersive(url);
          },
          onUrlChange: (change) {
            final url = change.url;
            if (url == null || !mounted) return;
            _syncDiscoverImmersive(url);
          },
          onPageFinished: (url) async {
            if (!mounted) return;
            _syncDiscoverImmersive(url);
            final c = _controller;
            if (c != null) {
              final back = await c.canGoBack();
              if (mounted) {
                setState(() {
                  _loading = false;
                  _hadFirstPaint = true;
                  _canGoBack = back;
                });
              }
              await _runBridgeJs(c, token);
              await _injectViewportMetrics();
              await _injectImPolish(c);
            } else if (mounted) {
              setState(() {
                _loading = false;
                _hadFirstPaint = true;
              });
            }
          },
          onWebResourceError: (err) {
            if (!mounted) return;
            if (!(err.isForMainFrame ?? true)) return;
            setState(() {
              _loading = false;
              _error = widget.forceOffline
                  ? widget.offlineBody
                  : '页面加载失败，请检查网络后重试';
            });
          },
          onNavigationRequest: (req) {
            final u = Uri.tryParse(req.url);
            if (u == null) return NavigationDecision.prevent;
            final host = Uri.parse(AppConfig.webBaseUrl).host;
            if (u.host == host || u.host.isEmpty) {
              final p = u.path.isEmpty ? '/' : u.path;
              if (_isNativePath(p)) {
                WidgetsBinding.instance.addPostFrameCallback((_) {
                  if (!mounted) return;
                  _openNativeFromWeb(u);
                });
                return NavigationDecision.prevent;
              }
              if (H5Whitelist.allows(p) ||
                  p == '/' ||
                  p.isEmpty ||
                  p.startsWith('/_next') ||
                  p.startsWith('/api')) {
                if (mounted) _syncDiscoverImmersive(req.url);
                return NavigationDecision.navigate;
              }
            }
            return NavigationDecision.navigate;
          },
        ),
      );

    if (!mounted) return;
    attachPeiaiJsChannel(
      controller,
      ref: ref,
      context: context,
      onGoBack: _onWillPop,
    );

    final platform = controller.platform;
    if (platform is AndroidWebViewController) {
      await platform.setMediaPlaybackRequiresUserGesture(false);
      await platform.setOnShowFileSelector(_pickFiles);
      await platform.setOnPlatformPermissionRequest((request) async {
        final needsMic = request.types.contains(
          WebViewPermissionResourceType.microphone,
        );
        if (needsMic) {
          final ok = await NativePermissions.requestMicrophone();
          if (!ok) {
            await request.deny();
            return;
          }
        }
        await request.grant();
      });
      // 私聊/群聊手势手感：允许内容中多点与垂直滚动
      try {
        await platform.setTextZoom(100);
      } catch (_) {}
    }

    try {
      final ua = await controller.getUserAgent();
      final version = await const AppUpdateService().installedVersion();
      await controller.setUserAgent(
        '${ua ?? ''} PeiaiFlutter/${version.name} (vc${version.code}) android_h5_tab'
            .trim(),
      );
    } catch (_) {}

    H5SessionBridge.register(controller);
    AppUpdateProgressHub.register(controller);
    await controller.loadRequest(uri);

    if (!mounted) return;
    setState(() {
      _controller = controller;
      _error = null;
    });
  }

  /// 常驻 WebView 内跳转到 `_activePath`（深链/open_path）。
  Future<void> _navigateActivePath() async {
    final c = _controller;
    if (c == null) {
      await _bootstrap();
      return;
    }
    final path = _activePath.startsWith('/') ? _activePath : '/$_activePath';
    final pathOnly = path.split('?').first;
    if (!H5Whitelist.allows(pathOnly)) return;
    await _prepareReadingHydrate(pathOnly);
    if (!mounted) return;
    final themeId = ref.read(appThemeProvider);
    final padTop = MediaQuery.paddingOf(context).top;
    final token = await ref.read(sessionProvider).token();
    if (!mounted) return;
    final uri = AppConfig.h5Uri(
      path,
      token: token,
      themeId: themeId.storageKey,
      shellInsetTop: widget.showAppBar ? 0 : padTop,
    );
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await c.setBackgroundColor(_surfaceBg(themeId));
    } catch (_) {}
    await c.loadRequest(uri);
  }

  /// IM 细节：输入栏、软键盘、禁止双 Tab 未读角标误伤宿主。
  Future<void> _injectImPolish(WebViewController c) async {
    await c.runJavaScript('''
(function(){
  try {
    var root = document.documentElement;
    root.classList.add('android-flutter-h5-im');
    // 宿主已有胶囊底栏：禁 Web 内 badge 跳动与 fixed 底栏
    var style = document.getElementById('peiai-flutter-im-polish');
    if (!style) {
      style = document.createElement('style');
      style.id = 'peiai-flutter-im-polish';
      document.head.appendChild(style);
    }
    style.textContent = ''
        + 'html.android-flutter-h5 .bottom-tabs,'
        + 'html.android-flutter-h5 nav.app-tabbar,'
        + 'html.android-flutter-h5 .app-bottom-tabs { display:none !important; }'
        + 'html.android-flutter-h5 body { overscroll-behavior-y: contain; }'
        // 与 H5 relative composer / 壳高策略一致：勿再用 inset 抬栏或垫 thread
        + 'html.android-flutter-h5.im-keyboard .im-composer-bar,'
        + 'html.android-flutter-h5 body.im-keyboard .im-composer-bar {'
        + '  bottom: auto !important;'
        + '  padding-bottom: max(8px, env(safe-area-inset-bottom, 0px));'
        + '}'
        // 左滑露出置顶/免打扰/不显示：与 web 一致允许 pan-x（此前误写成仅 pan-y）
        + 'html.android-flutter-h5 .swipe-reveal-row,'
        + 'html.android-flutter-h5 .swipe-reveal-content {'
        + '  touch-action: pan-x pan-y !important;'
        + '}'
        + 'html.android-flutter-h5 .discover-conv-li {'
        + '  -webkit-user-select: none; user-select: none;'
        + '}';
    // 左缘返回：通知可能的 SPA history（touch 可选，系统返回已走 goBack）
  } catch (e) {}
})();
''');
  }

  Future<List<String>> _pickFiles(FileSelectorParams params) async {
    try {
      final multi = params.mode == FileSelectorMode.openMultiple;
      final accepts = params.acceptTypes
          .map((e) => e.toLowerCase())
          .where((e) => e.isNotEmpty)
          .toList();
      final imageOnly =
          accepts.isNotEmpty &&
          accepts.every(
            (t) =>
                t.contains('image') ||
                t.endsWith('.png') ||
                t.endsWith('.jpg') ||
                t.endsWith('.jpeg') ||
                t.endsWith('.gif') ||
                t.endsWith('.webp'),
          );
      final result = await FilePicker.platform.pickFiles(
        allowMultiple: multi,
        type: imageOnly ? FileType.image : FileType.any,
        withData: false,
      );
      if (result == null) return <String>[];
      final out = <String>[];
      for (final f in result.files) {
        final path = f.path;
        if (path == null || path.isEmpty) continue;
        out.add(Uri.file(path).toString());
      }
      if (out.isEmpty && mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('未能选取图片，请重试或检查相册权限')));
      }
      return out;
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('选图失败，请稍后重试')));
      }
      return <String>[];
    }
  }

  Future<void> _runEarlyChrome(
    WebViewController c,
    String? token,
    AppThemeId themeId,
  ) async {
    final dark = themeId == AppThemeId.dark;
    final tokenJs = token != null && token.isNotEmpty ? _jsStr(token) : 'null';
    final top = widget.showAppBar ? 0.0 : MediaQuery.paddingOf(context).top;
    final pray = _isPraySurface;
    final pathOnly = _activePath.split('?').first;
    final campaign = pathOnly.startsWith('/campaigns');
    final earlyHostH = MediaQuery.sizeOf(context).height;
    await c.runJavaScript('''
(function(){
  try {
    var root = document.documentElement;
    var body = document.body;
    root.classList.add('android-flutter-h5', 'pwa-standalone');
    if (body) body.classList.add('android-flutter-h5', 'pwa-standalone');
    try { sessionStorage.setItem('peiai_client_kind', 'android_h5_tab'); } catch (e) {}
    var t = $tokenJs;
    if (t) { try { localStorage.setItem('presto_session_token', t); } catch (e) {} }
    root.setAttribute('data-peiai-theme', '${dark ? 'dark' : 'light'}');
    root.setAttribute('data-theme', '${dark ? 'dark' : 'light'}');
    root.style.setProperty('--shell-inset-top', '${top.toStringAsFixed(1)}px');
    root.style.setProperty('--peiai-vv-h', '${earlyHostH.toStringAsFixed(1)}px');
    root.style.setProperty('--im-vv-h', '${earlyHostH.toStringAsFixed(1)}px');
    ${_tabBarCssJs()}
    $_readingHydrateJs
    // 祷告：SPA hydrate 前先铺表面色，去掉「白屏一瞬」
    if ($pray) {
      root.classList.add('pray-session-open');
      if (body) {
        body.classList.add('pray-session-open');
        body.style.background = '#f3ebe3';
        body.style.overflow = 'hidden';
      }
      root.style.background = '#f3ebe3';
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', '#f3ebe3');
      var style = document.getElementById('peiai-pray-boot');
      if (!style) {
        style = document.createElement('style');
        style.id = 'peiai-pray-boot';
        (document.head || document.documentElement).appendChild(style);
      }
      style.textContent = 'html,body,#root{background:#f3ebe3!important;min-height:100%}';
    }
    if ($campaign) {
      var paper = '${dark ? '#1a1917' : '#fffcfa'}';
      root.style.background = paper;
      if (body) body.style.background = paper;
    }
  } catch (e) {}
})();
''');
  }

  bool _isNativePath(String p) {
    if (p.startsWith('/search/series')) return false;
    return p == '/reader' ||
        p.startsWith('/reader/') ||
        p == '/assistant' ||
        p.startsWith('/assistant/') ||
        p == '/plans' ||
        p.startsWith('/plans/') ||
        p == '/challenge' ||
        p.startsWith('/challenge/') ||
        p == '/search' ||
        (p.startsWith('/search/') && !p.startsWith('/search/series')) ||
        p == '/dictionary' ||
        p.startsWith('/dictionary/') ||
        p == '/notes' ||
        p.startsWith('/notes/') ||
        p == '/profile/appearance' ||
        p == '/knowledge-bases' ||
        p.startsWith('/knowledge-bases/');
  }

  void _openNativeFromWeb(Uri u) {
    final p = u.path;
    final qp = u.queryParameters;

    if (p.startsWith('/assistant')) {
      ref
          .read(assistantSeedProvider.notifier)
          .open(
            ref: qp['ref'] ?? qp['seed'] ?? qp['anchor'],
            question: qp['q'] ?? qp['question'],
          );
      ref.read(navIndexProvider.notifier).set(2);
      return;
    }
    if (p.startsWith('/reader')) {
      ref.read(navIndexProvider.notifier).set(1);
      context.push(Uri(path: '/reader', queryParameters: qp).toString());
      return;
    }
    if (p == '/notes' || p.startsWith('/notes/')) {
      context.push('/notes');
      return;
    }
    if (p == '/plans' || p.startsWith('/plans/')) {
      context.push(
        Uri(path: p, queryParameters: qp.isEmpty ? null : qp).toString(),
      );
      return;
    }
    if (p == '/challenge' || p.startsWith('/challenge/')) {
      context.push(
        Uri(path: p, queryParameters: qp.isEmpty ? null : qp).toString(),
      );
      return;
    }
    if (p == '/search' ||
        (p.startsWith('/search/') && !p.startsWith('/search/series'))) {
      context.push(
        Uri(path: p, queryParameters: qp.isEmpty ? null : qp).toString(),
      );
      return;
    }
    if (p == '/dictionary' || p.startsWith('/dictionary/')) {
      context.push('/dictionary');
      return;
    }
    if (p == '/profile/appearance') {
      context.push('/profile/appearance');
      return;
    }
    if (p == '/knowledge-bases' || p.startsWith('/knowledge-bases/')) {
      context.push(
        Uri(path: p, queryParameters: qp.isEmpty ? null : qp).toString(),
      );
    }
  }

  Future<void> _runBridgeJs(WebViewController c, String? token) async {
    if (!mounted) return;
    final themeId = ref.read(appThemeProvider);
    final dark = themeId == AppThemeId.dark;
    final pad = MediaQuery.paddingOf(context);
    final topInset = widget.showAppBar ? 0.0 : pad.top;
    final tokenJs = token != null && token.isNotEmpty ? _jsStr(token) : 'null';
    final theme = dark ? 'dark' : 'light';
    final vars = peiaiCssVars(themeId);
    final varJs = vars.entries
        .map((e) => "root.style.setProperty('${e.key}','${e.value}');")
        .join('');
    final prefs = ref.read(prefsProvider);
    final readingDnd = NotifPrefs.readingDnd(prefs);
    const hostTabs = ['home', 'bible', 'assistant', 'discover', 'profile'];
    // 叠层 H5（加好友/祷告等）与 Tab 内 WebView 区分，便于 Web 侧决定是否 close_h5
    final hostTab = widget.embedInTab
        ? hostTabs[(widget.tabIndex ?? 0).clamp(0, hostTabs.length - 1)]
        : 'overlay';

    await c.runJavaScript('''
(function(){
  try {
    var root = document.documentElement;
    var body = document.body;
    root.classList.add('android-flutter-h5', 'pwa-standalone');
    if (body) body.classList.add('android-flutter-h5', 'pwa-standalone');
    try { sessionStorage.setItem('peiai_client_kind', 'android_h5_tab'); } catch (e) {}
    var t = $tokenJs;
    if (t) {
      try { localStorage.setItem('presto_session_token', t); } catch (e) {}
    } else {
      try {
        localStorage.removeItem('presto_session_token');
        localStorage.removeItem('peiai_ft_token');
      } catch (e) {}
      try {
        window.dispatchEvent(new CustomEvent('peiai-flutter-logout'));
      } catch (e) {}
    }
    // 读经勿扰：与 Flutter SharedPreferences 对齐，写入 Web notif_prefs
    try {
      var np = {};
      try { np = JSON.parse(localStorage.getItem('presto_notif_prefs_v1') || '{}') || {}; } catch (e) {}
      np.readingDnd = ${readingDnd ? 'true' : 'false'};
      localStorage.setItem('presto_notif_prefs_v1', JSON.stringify(np));
      localStorage.setItem('presto_reminder_extra', JSON.stringify({
        group: np.socialDigest !== false,
        streak: !!np.streakRecall,
        reading_dnd: ${readingDnd ? 'true' : 'false'}
      }));
    } catch (e) {}
    root.setAttribute('data-peiai-theme', '$theme');
    root.setAttribute('data-peiai-client', 'android_h5_tab');
    root.setAttribute('data-peiai-host-tab', '$hostTab');
    root.setAttribute('data-theme', '$theme');
    root.setAttribute('data-app-theme', '${themeId.storageKey}');
    $varJs
    root.style.setProperty('--shell-inset-top', '${topInset.toStringAsFixed(1)}px');
    ${_tabBarCssJs()}
    $_readingHydrateJs
    root.style.setProperty('--shell-inset-left', '0px');
    root.style.setProperty('--shell-inset-right', '0px');
    window.__PEIAI_FLUTTER__ = {
      client: 'android_h5_tab',
      theme: '${themeId.storageKey}',
      hostTab: '$hostTab',
      openNative: function(payload) {
        try {
          if (window.PeiaiFlutter && window.PeiaiFlutter.postMessage) {
            window.PeiaiFlutter.postMessage(
              typeof payload === 'string' ? payload : JSON.stringify(payload || {})
            );
          }
        } catch (e) {}
      }
    };
    // SPA 路由同步：私聊/群聊时让壳隐藏原生五 Tab
    try {
      if (!window.__PEIAI_PATH_HOOK__) {
        window.__PEIAI_PATH_HOOK__ = true;
        var notifyPath = function() {
          try {
            var p = (location.pathname || '/') + (location.search || '');
            if (window.PeiaiFlutter && window.PeiaiFlutter.postMessage) {
              window.PeiaiFlutter.postMessage(JSON.stringify({
                type: 'path_changed',
                path: p
              }));
            }
          } catch (e) {}
        };
        var _ps = history.pushState;
        var _rs = history.replaceState;
        history.pushState = function() {
          var r = _ps.apply(this, arguments);
          notifyPath();
          return r;
        };
        history.replaceState = function() {
          var r = _rs.apply(this, arguments);
          notifyPath();
          return r;
        };
        window.addEventListener('popstate', notifyPath);
        notifyPath();
      }
    } catch (e) {}
  } catch (e) {}
})();
''');
    AppUpdateProgressHub.register(c);
  }

  static String _jsStr(String s) {
    return "'${s.replaceAll(r'\', r'\\').replaceAll("'", r"\'").replaceAll('\n', r'\n')}'";
  }

  /// §24.6：先关 H5 半屏 → Web 历史 → 再交给 Flutter。
  /// 返回 true = 可离开本页。
  Future<bool> _onWillPop() async {
    final c = _controller;
    if (c == null) return true;

    // 1) 关掉 portal / sheet（对齐 Web dismissPortaledOverlays）
    try {
      final dismissed = await c.runJavaScriptReturningResult('''
(function(){
  try {
    if (typeof window.__PEIAI_DISMISS_OVERLAYS__ === 'function') {
      window.__PEIAI_DISMISS_OVERLAYS__();
      return '1';
    }
    var sels = [
      '.sheet-backdrop',
      '.reader-sheet-backdrop',
      '[data-dismiss-on-tab-nav].sheet-backdrop',
      '.modal-backdrop',
      '[role="dialog"] .sheet-backdrop'
    ];
    for (var i = 0; i < sels.length; i++) {
      var el = document.querySelector(sels[i]);
      if (el) { el.click(); return '1'; }
    }
    return '0';
  } catch (e) { return '0'; }
})();
''');
      final raw = '$dismissed'.replaceAll('"', '');
      if (raw == '1' || raw == 'true') {
        final back = await c.canGoBack();
        if (mounted) setState(() => _canGoBack = back);
        return false;
      }
    } catch (_) {}

    // 2) Web 历史
    if (await c.canGoBack()) {
      await c.goBack();
      final back = await c.canGoBack();
      if (mounted) setState(() => _canGoBack = back);
      return false;
    }

    // 3) 深链直达私聊/群聊时常无历史：回发现列表，避免卡死聊天
    if (widget.embedInTab &&
        widget.tabIndex == 3 &&
        isDiscoverChatPath(_activePath)) {
      _activePath = '/discover';
      syncDiscoverChromeFromPath(ref, _activePath);
      await _navigateActivePath();
      return false;
    }
    return true;
  }

  @override
  Widget build(BuildContext context) {
    // 主题切换时重注入 H5 CSS vars（建议对齐：减「两个 App」感）
    ref.listen(appThemeProvider, (prev, next) {
      if (prev == next) return;
      final c = _controller;
      if (c == null) return;
      unawaited(
        ref.read(sessionProvider).token().then((t) => _runBridgeJs(c, t)),
      );
    });

    // 聊天沉浸切换：同步浮动底栏 CSS 占位
    if (widget.embedInTab) {
      ref.listen(discoverImmersiveProvider, (prev, next) {
        if (prev == next) return;
        final c = _controller;
        if (c == null) return;
        unawaited(_injectTabBarMetrics(c));
      });
    }

    // 发现等 Tab：切 Tab / 勿扰变更时回写 hostTab + readingDnd（读经勿扰）
    if (widget.tabIndex != null) {
      ref.listen(navIndexProvider, (prev, next) {
        if (prev == next) return;
        if (widget.tabIndex == 3) {
          if (next == 3) {
            final loc = ref.read(discoverH5LocationProvider);
            _activePath = loc;
            _syncDiscoverImmersive(loc);
            unawaited(_reinjectSession());
          } else if (prev == 3) {
            ref.read(discoverImmersiveProvider.notifier).set(false);
            unawaited(_pauseDiscoverRealtime());
          }
          return;
        }
        if (next != widget.tabIndex) return;
        if (widget.forceOffline) return;
        unawaited(_reinjectSession());
      });
      ref.listen(readingDndEpochProvider, (prev, next) {
        if (prev == next) return;
        unawaited(_reinjectSession());
      });
    }

    // 深链 / open_path：发现子路径喂进常驻 WebView
    if (widget.embedInTab && widget.tabIndex == 3) {
      ref.listen(discoverH5PathProvider, (prev, next) {
        if (next == null || next.isEmpty) return;
        ref.read(discoverH5PathProvider.notifier).consume();
        final path = next.startsWith('/') ? next : '/$next';
        if (path.split('?').first == _activePath.split('?').first &&
            path == _activePath) {
          return;
        }
        _activePath = path;
        _syncDiscoverImmersive(path);
        unawaited(_navigateActivePath());
      });
    }

    final themeId = ref.watch(appThemeProvider);
    final bg = _surfaceBg(themeId);
    final inkFaint = context.peiaiInkFaint;
    final praySurface = _isPraySurface;

    final isOfflineBanner = widget.forceOffline;
    final showErrorPane = _error != null && _controller == null;

    Widget webStack = Stack(
      fit: StackFit.expand,
      children: [
        ColoredBox(color: bg),
        if (_controller != null) WebViewWidget(controller: _controller!),
        // 祷告：首屏只用同色底，不放转圈（对齐 PWA 即时表面，避免跳闪空白感）
        if (_loading && !_hadFirstPaint)
          ColoredBox(
            color: bg,
            child: praySurface
                ? const SizedBox.expand()
                : Center(
                    child: SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(
                        strokeWidth: 1.8,
                        color: Theme.of(
                          context,
                        ).colorScheme.primary.withValues(alpha: 0.45),
                      ),
                    ),
                  ),
          )
        else if (_loading)
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: LinearProgressIndicator(
              minHeight: 1.5,
              backgroundColor: Colors.transparent,
              color: Theme.of(
                context,
              ).colorScheme.primary.withValues(alpha: 0.35),
            ),
          ),
        if (isOfflineBanner)
          Positioned(
            left: 12,
            right: 12,
            top: 12,
            child: Material(
              elevation: 1,
              borderRadius: BorderRadius.circular(12),
              color: Theme.of(context).colorScheme.surface,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
                child: Row(
                  children: [
                    Icon(Icons.cloud_off_outlined, size: 18, color: inkFaint),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        widget.offlineBody,
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: inkFaint,
                          height: 1.4,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
      ],
    );

    Widget body = showErrorPane
        ? ColoredBox(
            color: bg,
            child: Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.error_outline, size: 36, color: inkFaint),
                    const SizedBox(height: 12),
                    Text(
                      '无法打开页面',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      _error ?? widget.offlineBody,
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: inkFaint,
                        height: 1.45,
                      ),
                    ),
                    const SizedBox(height: 16),
                    FilledButton(
                      onPressed: () {
                        setState(() {
                          _error = null;
                          _loading = true;
                          _hadFirstPaint = false;
                        });
                        _bootstrap();
                      },
                      child: const Text('重试'),
                    ),
                  ],
                ),
              ),
            ),
          )
        : webStack;

    // 键盘：resizeToAvoidBottomInset 默认 true，与 WebView 共用高度
    // LayoutBuilder 在约束变化时刷新 vv，避免 100dvh 误用设备全高
    Widget sized = LayoutBuilder(
      builder: (ctx, constraints) {
        final nextH = constraints.maxHeight;
        if (_viewHeight != nextH && nextH > 0) {
          _viewHeight = nextH;
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) _scheduleViewportMetrics();
          });
        }
        return body;
      },
    );

    final content = widget.showAppBar
        ? Scaffold(
            backgroundColor: bg,
            resizeToAvoidBottomInset: true,
            appBar: AppBar(
              title: Text(widget.title ?? '彼爱'),
              leading: IconButton(
                icon: const Icon(Icons.arrow_back_ios_new, size: 18),
                onPressed: () async {
                  if (await _onWillPop()) {
                    if (context.mounted) Navigator.of(context).maybePop();
                  }
                },
              ),
            ),
            body: sized,
          )
        : Scaffold(
            backgroundColor: bg,
            resizeToAvoidBottomInset: true,
            body: sized,
          );

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: (Theme.of(context).brightness == Brightness.dark
              ? SystemUiOverlayStyle.light
              : SystemUiOverlayStyle.dark)
          .copyWith(
        systemNavigationBarColor:
            praySurface ? _praySurface : Theme.of(context).scaffoldBackgroundColor,
      ),
      child: PopScope(
        canPop: !widget.embedInTab && !_canGoBack,
        onPopInvokedWithResult: (didPop, _) async {
          if (didPop) return;
          final empty = await _onWillPop();
          if (empty && !widget.embedInTab && context.mounted) {
            Navigator.of(context).maybePop();
          }
        },
        child: content,
      ),
    );
  }
}
