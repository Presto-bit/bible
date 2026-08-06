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
import 'api_client.dart';
import 'app_theme.dart';
import 'config.dart';
import 'h5_bridge_channel.dart';
import 'h5_session_bridge.dart';
import 'h5_whitelist.dart';
import 'theme_ext.dart';

class H5HostPage extends ConsumerStatefulWidget {
  const H5HostPage({
    super.key,
    required this.path,
    this.showAppBar = false,
    this.title,
    this.embedInTab = false,
  });

  final String path;
  final bool showAppBar;
  final String? title;
  final bool embedInTab;

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

  /// 视图可见高度（键盘弹起时收小），同步给 H5 --im-kb / vv
  double? _viewHeight;
  double? _viewBottomInset;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) => _bootstrap());
  }

  @override
  void dispose() {
    final c = _controller;
    if (c != null) H5SessionBridge.unregister(c);
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _reinjectSession();
    }
  }

  @override
  void didChangeMetrics() {
    // 键盘 resize：把 visual 高度注入 H5，贴近 iOS PWA 输入栏贴边
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final mq = MediaQuery.of(context);
      final h = mq.size.height;
      final bottom = mq.viewInsets.bottom;
      if (_viewHeight == h && _viewBottomInset == bottom) return;
      _viewHeight = h;
      _viewBottomInset = bottom;
      _injectViewportMetrics();
    });
  }

  Future<void> _reinjectSession() async {
    final c = _controller;
    if (c == null) return;
    final token = await ref.read(sessionProvider).token();
    await _runBridgeJs(c, token);
  }

  Future<void> _injectViewportMetrics() async {
    final c = _controller;
    if (c == null || !mounted) return;
    final mq = MediaQuery.of(context);
    final h = mq.size.height - mq.viewInsets.bottom;
    final kb = mq.viewInsets.bottom;
    await c.runJavaScript('''
(function(){
  try {
    var root = document.documentElement;
    root.style.setProperty('--peiai-vv-h', '${h.toStringAsFixed(1)}px');
    root.style.setProperty('--im-kb-inset', '${kb.toStringAsFixed(1)}px');
    if ($kb > 0) {
      document.body && document.body.classList.add('im-keyboard', 'android-flutter-kb');
    } else {
      document.body && document.body.classList.remove('im-keyboard', 'android-flutter-kb');
    }
  } catch (e) {}
})();
''');
  }

  Future<void> _bootstrap() async {
    final path = widget.path.startsWith('/') ? widget.path : '/${widget.path}';
    final pathOnly = path.split('?').first;
    if (!H5Whitelist.allows(pathOnly)) {
      setState(() {
        _error = '该页面不在 H5 白名单内';
        _loading = false;
      });
      return;
    }

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
      ..setBackgroundColor(peiaiPaperFor(themeId))
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (_) {
            if (mounted) setState(() => _loading = true);
            // 尽早再推一次 chrome 类，压 Web 双底栏闪现
            unawaited(_runEarlyChrome(controller, token, themeId));
          },
          onPageFinished: (_) async {
            if (!mounted) return;
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
              _error = '页面加载失败，请检查网络后重试';
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
                return NavigationDecision.navigate;
              }
            }
            return NavigationDecision.navigate;
          },
        ),
      );

    if (!mounted) return;
    attachPeiaiJsChannel(controller, ref: ref, context: context);

    final platform = controller.platform;
    if (platform is AndroidWebViewController) {
      await platform.setMediaPlaybackRequiresUserGesture(false);
      await platform.setOnShowFileSelector(_pickFiles);
    }

    try {
      final ua = await controller.getUserAgent();
      await controller.setUserAgent(
        '${ua ?? ''} PeiaiFlutter/3.0 android_h5_tab'.trim(),
      );
    } catch (_) {}

    H5SessionBridge.register(controller);
    await controller.loadRequest(uri);

    if (!mounted) return;
    setState(() {
      _controller = controller;
      _error = null;
    });
  }

  Future<List<String>> _pickFiles(FileSelectorParams params) async {
    try {
      final multi = params.mode == FileSelectorMode.openMultiple;
      final result = await FilePicker.platform.pickFiles(
        allowMultiple: multi,
        type: FileType.any,
        withData: false,
      );
      if (result == null) return <String>[];
      final out = <String>[];
      for (final f in result.files) {
        final path = f.path;
        if (path == null || path.isEmpty) continue;
        out.add(Uri.file(path).toString());
      }
      return out;
    } catch (_) {
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
        p == '/wrapped' ||
        p.startsWith('/wrapped') ||
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
      ref.read(navIndexProvider.notifier).set(2);
      context.push(Uri(
        path: '/assistant',
        queryParameters: qp,
      ).toString());
      return;
    }
    if (p.startsWith('/reader')) {
      ref.read(navIndexProvider.notifier).set(1);
      context.push(Uri(
        path: '/reader',
        queryParameters: qp,
      ).toString());
      return;
    }
    if (p == '/notes' || p.startsWith('/notes/')) {
      context.push('/notes');
      return;
    }
    if (p == '/plans' || p.startsWith('/plans/')) {
      context.push(Uri(path: p, queryParameters: qp.isEmpty ? null : qp)
          .toString());
      return;
    }
    if (p == '/challenge' || p.startsWith('/challenge/')) {
      context.push(Uri(path: p, queryParameters: qp.isEmpty ? null : qp)
          .toString());
      return;
    }
    if (p == '/search' ||
        (p.startsWith('/search/') && !p.startsWith('/search/series'))) {
      context.push(Uri(path: p, queryParameters: qp.isEmpty ? null : qp)
          .toString());
      return;
    }
    if (p == '/dictionary' || p.startsWith('/dictionary/')) {
      context.push('/dictionary');
      return;
    }
    if (p == '/wrapped' || p.startsWith('/wrapped')) {
      context.push(Uri(path: '/wrapped', queryParameters: qp.isEmpty ? null : qp)
          .toString());
      return;
    }
    if (p == '/profile/appearance') {
      context.push('/profile/appearance');
      return;
    }
    if (p == '/knowledge-bases' || p.startsWith('/knowledge-bases/')) {
      context.push(Uri(path: p, queryParameters: qp.isEmpty ? null : qp)
          .toString());
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
    root.setAttribute('data-peiai-theme', '$theme');
    root.setAttribute('data-peiai-client', 'android_h5_tab');
    root.setAttribute('data-theme', '$theme');
    root.setAttribute('data-app-theme', '${themeId.storageKey}');
    $varJs
    root.style.setProperty('--shell-inset-top', '${topInset.toStringAsFixed(1)}px');
    root.style.setProperty('--shell-inset-bottom', '0px');
    root.style.setProperty('--shell-inset-left', '0px');
    root.style.setProperty('--shell-inset-right', '0px');
    window.__PEIAI_FLUTTER__ = {
      client: 'android_h5_tab',
      theme: '${themeId.storageKey}',
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
  } catch (e) {}
})();
''');
  }

  static String _jsStr(String s) {
    return "'${s.replaceAll(r'\', r'\\').replaceAll("'", r"\'").replaceAll('\n', r'\n')}'";
  }

  /// 返回 true = 可离开本页（无 Web 历史）
  Future<bool> _onWillPop() async {
    final c = _controller;
    if (c != null && await c.canGoBack()) {
      await c.goBack();
      final back = await c.canGoBack();
      if (mounted) setState(() => _canGoBack = back);
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
      unawaited(ref.read(sessionProvider).token().then((t) => _runBridgeJs(c, t)));
    });

    final themeId = ref.watch(appThemeProvider);
    final bg = peiaiPaperFor(themeId);
    final inkFaint = context.peiaiInkFaint;

    Widget body = _error != null
        ? ColoredBox(
            color: bg,
            child: Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      _error!,
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.bodyLarge,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '若刚刚断网，消息可能尚未发出；联网后请重试本页。',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: inkFaint,
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
        : Stack(
            fit: StackFit.expand,
            children: [
              ColoredBox(color: bg),
              if (_controller != null)
                WebViewWidget(controller: _controller!),
              if (_loading && !_hadFirstPaint)
                ColoredBox(
                  color: bg,
                  child: Center(
                    child: SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(
                        strokeWidth: 1.8,
                        color: Theme.of(context)
                            .colorScheme
                            .primary
                            .withValues(alpha: 0.45),
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
                    color: Theme.of(context)
                        .colorScheme
                        .primary
                        .withValues(alpha: 0.35),
                  ),
                ),
            ],
          );

    // 键盘：resizeToAvoidBottomInset 默认 true，与 WebView 共用高度
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
            body: body,
          )
        : Scaffold(
            backgroundColor: bg,
            resizeToAvoidBottomInset: true,
            body: body,
          );

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: Theme.of(context).brightness == Brightness.dark
          ? SystemUiOverlayStyle.light
          : SystemUiOverlayStyle.dark,
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
