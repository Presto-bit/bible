/// 质感系统卡片 —— 对齐 canvas demo 的「柔光纸感分层」。
///
/// 三级 elevation：长柔阴影 + 顶部高光（用渐变叠层模拟 inset highlight）+
/// 可选主题色调染（tonalWash）。tier1 列表 / tier2 操作 / tier3 hero。
library;

import 'package:flutter/material.dart';

import '../theme.dart';

class PaperCard extends StatelessWidget {
  const PaperCard({
    super.key,
    required this.child,
    this.tier = 1,
    this.tint,
    this.padding = const EdgeInsets.all(16),
    this.onTap,
    this.margin,
    this.accent = false,
    this.backgroundLayer,
  }) : assert(tier >= 1 && tier <= 3);

  /// 1 列表 / 2 操作 / 3 hero。
  final int tier;

  /// 主题色调（用于 hero/强调卡的渐变染与描边）。
  final Color? tint;
  final EdgeInsetsGeometry padding;
  final EdgeInsetsGeometry? margin;
  final VoidCallback? onTap;

  /// 强调卡：左侧 3px 主题色竖条（对齐 canvas TappableCard accent）。
  final bool accent;

  /// 可选背景层（铺满卡面、随圆角裁剪），用于 hero 场景渐变等。
  final Widget? backgroundLayer;
  final Widget child;

  static List<BoxShadow> _shadow(int tier) {
    const ink = Color(0xFF2C2825);
    switch (tier) {
      case 3:
        return [
          BoxShadow(
            color: ink.withValues(alpha: 0.18),
            blurRadius: 36,
            spreadRadius: -14,
            offset: const Offset(0, 16),
          ),
        ];
      case 2:
        return [
          BoxShadow(
            color: ink.withValues(alpha: 0.12),
            blurRadius: 16,
            spreadRadius: -6,
            offset: const Offset(0, 4),
          ),
        ];
      default:
        return [
          BoxShadow(
            color: ink.withValues(alpha: 0.05),
            blurRadius: 2,
            offset: const Offset(0, 1),
          ),
        ];
    }
  }

  double get _radius => tier == 3
      ? 18
      : tier == 2
          ? 14
          : 12;

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.circular(_radius);
    final borderColor =
        tint != null ? tint!.withValues(alpha: 0.22) : AppColors.line;

    // 底色：tier>=2 用更亮的卡面，tier1 用常规卡面。
    final base = AppColors.surface;

    // 顶部高光 + 可选色调染（从上到下淡出）。
    final wash = tint != null
        ? LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              tint!.withValues(alpha: 0.12),
              tint!.withValues(alpha: 0.03),
              Colors.transparent,
            ],
            stops: const [0, 0.6, 1],
          )
        : const LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0x66FFFFFF), Color(0x00FFFFFF)],
            stops: [0, 0.55],
          );

    final accentColor = (tint ?? AppColors.accent).withValues(alpha: 0.7);
    final content = DecoratedBox(
      decoration: BoxDecoration(
        color: base,
        borderRadius: radius,
        border: Border.all(color: borderColor),
        boxShadow: _shadow(tier),
      ),
      child: ClipRRect(
        borderRadius: radius,
        child: Stack(
          children: [
            if (backgroundLayer != null) Positioned.fill(child: backgroundLayer!),
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

    final card = onTap == null
        ? content
        : Material(
            color: Colors.transparent,
            child: InkWell(
              borderRadius: radius,
              onTap: onTap,
              child: content,
            ),
          );

    return margin == null ? card : Padding(padding: margin!, child: card);
  }
}
