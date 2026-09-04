/// 彼爱视觉 polish 令牌 —— 对齐 Web `design_tokens.css` / `pwa_polish.css`。
library;

import 'package:flutter/material.dart';

/// 动效时长（对齐 `--peiai-motion-*`）。
abstract final class PeiaiMotion {
  static const fast = Duration(milliseconds: 140);
  static const normal = Duration(milliseconds: 220);
  static const enter = Duration(milliseconds: 320);

  static const fastCurve = Cubic(0.25, 0.8, 0.25, 1);
  static const enterCurve = Cubic(0.22, 0.84, 0.22, 1);
}

/// 纸感阴影（对齐 `--peiai-shadow-*`）。
abstract final class PeiaiShadows {
  static Color _ink(bool dark) => dark ? Colors.black : const Color(0xFF0F172A);

  static List<BoxShadow> card(bool dark) => [
        BoxShadow(
          color: _ink(dark).withValues(alpha: dark ? 0.28 : 0.04),
          blurRadius: 0,
          offset: const Offset(0, 1),
        ),
        BoxShadow(
          color: _ink(dark).withValues(alpha: dark ? 0.22 : 0.06),
          blurRadius: 8,
          offset: const Offset(0, 2),
        ),
        BoxShadow(
          color: _ink(dark).withValues(alpha: dark ? 0.18 : 0.08),
          blurRadius: 28,
          offset: const Offset(0, 10),
        ),
      ];

  static List<BoxShadow> cardLift(bool dark) => [
        BoxShadow(
          color: _ink(dark).withValues(alpha: dark ? 0.32 : 0.05),
          blurRadius: 0,
          offset: const Offset(0, 2),
        ),
        BoxShadow(
          color: _ink(dark).withValues(alpha: dark ? 0.26 : 0.10),
          blurRadius: 20,
          offset: const Offset(0, 8),
        ),
        BoxShadow(
          color: _ink(dark).withValues(alpha: dark ? 0.22 : 0.12),
          blurRadius: 40,
          offset: const Offset(0, 16),
        ),
      ];

  static List<BoxShadow> hero(bool dark, {Color? accentDeep}) {
    final accent = accentDeep ?? const Color(0xFF06AE56);
    return [
      BoxShadow(
        color: _ink(dark).withValues(alpha: dark ? 0.35 : 0.06),
        blurRadius: 0,
        offset: const Offset(0, 2),
      ),
      BoxShadow(
        color: _ink(dark).withValues(alpha: dark ? 0.28 : 0.12),
        blurRadius: 32,
        offset: const Offset(0, 12),
      ),
      BoxShadow(
        color: accent.withValues(alpha: dark ? 0.14 : 0.10),
        blurRadius: 56,
        offset: const Offset(0, 24),
      ),
    ];
  }
}

/// 区块 stagger 入场（对齐 PWA `peiai-stagger-in`）。
class PeiaiStagger extends StatefulWidget {
  const PeiaiStagger({
    super.key,
    required this.child,
    this.enabled = true,
    this.delayMs = 0,
  });

  final Widget child;
  final bool enabled;
  final int delayMs;

  @override
  State<PeiaiStagger> createState() => _PeiaiStaggerState();
}

class _PeiaiStaggerState extends State<PeiaiStagger>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctl;
  late final Animation<double> _fade;
  late final Animation<Offset> _slide;

  @override
  void initState() {
    super.initState();
    _ctl = AnimationController(vsync: this, duration: PeiaiMotion.enter);
    _fade = CurvedAnimation(parent: _ctl, curve: PeiaiMotion.enterCurve);
    _slide = Tween<Offset>(
      begin: const Offset(0, 0.05),
      end: Offset.zero,
    ).animate(CurvedAnimation(parent: _ctl, curve: PeiaiMotion.enterCurve));
    _start();
  }

  void _start() {
    if (!widget.enabled) {
      _ctl.value = 1;
      return;
    }
    Future.delayed(Duration(milliseconds: widget.delayMs), () {
      if (mounted) _ctl.forward();
    });
  }

  @override
  void didUpdateWidget(covariant PeiaiStagger oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!oldWidget.enabled && widget.enabled) {
      _ctl.value = 0;
      _start();
    }
  }

  @override
  void dispose() {
    _ctl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: _fade,
      child: SlideTransition(position: _slide, child: widget.child),
    );
  }
}
