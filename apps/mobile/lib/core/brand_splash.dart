import 'dart:async';

import 'package:flutter/material.dart';

/// 对齐 PWA `apps/web/lib/brand_splash.ts`
const brandSplashMinMs = 2000;
const brandSplashFadeMs = 250;
const brandSplashMaxMs = 3500;
const brandSplashBg = Color(0xFFFFFCFA);
const brandSplashTitleInk = Color(0xFF2C2825);
const brandSplashSubInk = Color(0xFF6B6358);
const brandSplashTitle = '彼爱';
const brandSplashSubtitle = 'Love Each Other';
const brandSplashIconAsset = 'assets/app_icon_shelf.png';

/// 进程内冷启动标记：杀进程后重置；同进程热恢复不再出开屏。
class BrandSplashState {
  BrandSplashState._();

  static bool _done = false;
  static Completer<void>? _readyCompleter;

  static bool get shouldShow => !_done;

  static Future<void> get ready {
    if (_done) return Future.value();
    _readyCompleter ??= Completer<void>();
    return _readyCompleter!.future;
  }

  static void markDone() {
    if (_done) return;
    _done = true;
    if (_readyCompleter != null && !_readyCompleter!.isCompleted) {
      _readyCompleter!.complete();
    }
    _readyCompleter = null;
  }
}

/// 全屏品牌开屏：纸底 + App icon + 彼爱 / Love Each Other。
class BrandSplashHost extends StatefulWidget {
  const BrandSplashHost({required this.child, super.key});

  final Widget child;

  @override
  State<BrandSplashHost> createState() => _BrandSplashHostState();
}

class _BrandSplashHostState extends State<BrandSplashHost> {
  bool _visible = false;
  bool _fading = false;
  bool _finished = false;
  Timer? _minTimer;
  Timer? _maxTimer;
  Timer? _fadeTimer;

  @override
  void initState() {
    super.initState();
    if (!BrandSplashState.shouldShow) {
      BrandSplashState.markDone();
      return;
    }
    _visible = true;
    _minTimer = Timer(const Duration(milliseconds: brandSplashMinMs), _beginFade);
    _maxTimer = Timer(const Duration(milliseconds: brandSplashMaxMs), _beginFade);
  }

  @override
  void dispose() {
    _minTimer?.cancel();
    _maxTimer?.cancel();
    _fadeTimer?.cancel();
    super.dispose();
  }

  void _beginFade() {
    if (_finished || _fading || !mounted) return;
    setState(() => _fading = true);
    _fadeTimer?.cancel();
    _fadeTimer = Timer(const Duration(milliseconds: brandSplashFadeMs), _finish);
  }

  void _finish() {
    if (_finished || !mounted) return;
    _finished = true;
    _minTimer?.cancel();
    _maxTimer?.cancel();
    BrandSplashState.markDone();
    setState(() => _visible = false);
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        widget.child,
        if (_visible)
          IgnorePointer(
            child: AnimatedOpacity(
              opacity: _fading ? 0 : 1,
              duration: const Duration(milliseconds: brandSplashFadeMs),
              child: const _BrandSplashOverlay(),
            ),
          ),
      ],
    );
  }
}

class _BrandSplashOverlay extends StatelessWidget {
  const _BrandSplashOverlay();

  @override
  Widget build(BuildContext context) {
    final iconSize = (MediaQuery.sizeOf(context).width * 0.3).clamp(96.0, 120.0);
    return ColoredBox(
      color: brandSplashBg,
      child: SafeArea(
        child: Center(
          child: Transform.translate(
            offset: Offset(0, -MediaQuery.sizeOf(context).height * 0.06),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(iconSize * 0.22),
                  child: Image.asset(
                    brandSplashIconAsset,
                    width: iconSize,
                    height: iconSize,
                    fit: BoxFit.contain,
                  ),
                ),
                const SizedBox(height: 20),
                Text(
                  brandSplashTitle,
                  style: TextStyle(
                    fontSize: (MediaQuery.sizeOf(context).width * 0.071).clamp(26.0, 28.0),
                    fontWeight: FontWeight.w600,
                    letterSpacing: 0.02 * 16,
                    color: brandSplashTitleInk,
                    height: 1.2,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  brandSplashSubtitle,
                  style: TextStyle(
                    fontSize: (MediaQuery.sizeOf(context).width * 0.033).clamp(12.0, 13.0),
                    fontWeight: FontWeight.w400,
                    letterSpacing: 0.08 * 12,
                    color: brandSplashSubInk,
                    height: 1.3,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
