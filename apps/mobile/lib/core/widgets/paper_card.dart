/// 质感系统卡片 —— 对齐 Web soft card / `--home-card-radius` / `--home-shadow`。
///
/// 三级 elevation：长柔阴影 + 顶部高光 + 可选主题色调染。
/// tier1 列表 / tier2 操作·身份主卡 / tier3 hero。
library;

import 'package:flutter/material.dart';

class PaperCard extends StatelessWidget {
  const PaperCard({
    super.key,
    required this.child,
    this.tier = 1,
    this.tint,
    this.padding = const EdgeInsets.all(16),
    this.onTap,
    this.onLongPress,
    this.margin,
    this.accent = false,
    this.backgroundLayer,
  }) : assert(tier >= 1 && tier <= 3);

  /// 1 列表 / 2 操作·同行主卡 / 3 hero。
  final int tier;

  /// 主题色调（用于 hero/强调卡的渐变染与描边）。
  final Color? tint;
  final EdgeInsetsGeometry padding;
  final EdgeInsetsGeometry? margin;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;

  /// 强调卡：左侧 3px 主题色竖条（对齐 canvas TappableCard accent）。
  final bool accent;

  /// 可选背景层（铺满卡面、随圆角裁剪），用于 hero 场景渐变等。
  final Widget? backgroundLayer;
  final Widget child;

  /// 对齐 PWA token：常规卡 12px，大卡 16px。
  double get _radius => tier == 1 ? 12 : 16;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final radius = BorderRadius.circular(_radius);
    final dark = theme.brightness == Brightness.dark;
    final line = theme.dividerColor;
    final surface = theme.colorScheme.surface;
    final primary = theme.colorScheme.primary;
    // 对齐 PWA 低对比边界，避免卡片在浅色主题显得厚重。
    final softEdge = Color.lerp(
      theme.colorScheme.onSurface.withValues(alpha: 0.45),
      line,
      0.78,
    )!.withValues(alpha: dark ? 0.55 : 0.9);
    final borderColor = tint != null ? tint!.withValues(alpha: 0.22) : softEdge;

    final base = surface;

    final wash = tint != null
        ? LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color.lerp(tint!, surface, 0.89)!, surface],
            stops: const [0, 0.58],
          )
        : LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              Colors.white.withValues(alpha: dark ? 0.06 : 0.4),
              Colors.transparent,
            ],
            stops: const [0, 0.55],
          );

    final accentColor = (tint ?? primary).withValues(alpha: 0.7);
    final content = DecoratedBox(
      decoration: BoxDecoration(
        color: base,
        borderRadius: radius,
        border: Border.all(color: borderColor),
        boxShadow: _shadow(tier, dark),
      ),
      child: ClipRRect(
        borderRadius: radius,
        child: Stack(
          children: [
            if (backgroundLayer != null)
              Positioned.fill(child: backgroundLayer!),
            Positioned.fill(
              child: DecoratedBox(decoration: BoxDecoration(gradient: wash)),
            ),
            if (accent)
              Positioned(
                left: 0,
                top: 0,
                bottom: 0,
                child: Container(width: 3, color: accentColor),
              ),
            Padding(
              padding: accent
                  ? padding.add(const EdgeInsets.only(left: 3))
                  : padding,
              child: child,
            ),
          ],
        ),
      ),
    );

    final card = onTap == null && onLongPress == null
        ? content
        : _PaperCardTapSurface(
            radius: radius,
            onTap: onTap,
            onLongPress: onLongPress,
            child: content,
          );

    return margin == null ? card : Padding(padding: margin!, child: card);
  }

  /// 对齐 Web `--home-shadow` / `--home-shadow-lift`。
  static List<BoxShadow> _shadow(int tier, bool dark) {
    final ink = dark ? const Color(0xFF000000) : const Color(0xFF0F172A);
    switch (tier) {
      case 3:
        return [
          BoxShadow(
            color: ink.withValues(alpha: dark ? 0.4 : 0.10),
            blurRadius: 24,
            offset: const Offset(0, 8),
          ),
        ];
      case 2:
        return [
          BoxShadow(
            color: ink.withValues(alpha: dark ? 0.3 : 0.08),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ];
      default:
        return [
          BoxShadow(
            color: ink.withValues(alpha: dark ? 0.22 : 0.05),
            blurRadius: 6,
            offset: const Offset(0, 1),
          ),
        ];
    }
  }
}

/// 与 PWA soft card 一致的轻按压：仅交互卡启用，减少「静态方块」感。
class _PaperCardTapSurface extends StatefulWidget {
  const _PaperCardTapSurface({
    required this.radius,
    this.onTap,
    this.onLongPress,
    required this.child,
  });

  final BorderRadius radius;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;
  final Widget child;

  @override
  State<_PaperCardTapSurface> createState() => _PaperCardTapSurfaceState();
}

class _PaperCardTapSurfaceState extends State<_PaperCardTapSurface> {
  var _pressed = false;

  void _setPressed(bool value) {
    if (_pressed != value && mounted) setState(() => _pressed = value);
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedScale(
      duration: const Duration(milliseconds: 110),
      curve: Curves.easeOut,
      scale: _pressed ? 0.985 : 1,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: widget.radius,
          onTap: widget.onTap,
          onLongPress: widget.onLongPress,
          onHighlightChanged: _setPressed,
          child: widget.child,
        ),
      ),
    );
  }
}
