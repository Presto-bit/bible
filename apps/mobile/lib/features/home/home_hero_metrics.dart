/// 首页 Hero 尺寸，对齐 PWA `.hero-verse`。
library;

import 'package:flutter/widgets.dart';

/// PWA：`min-height: clamp(16.5rem, 60vw, 21.75rem)`；长日课略加高以装全文。
double homeHeroVerseHeight(BuildContext context, {int textLen = 0}) {
  final w = MediaQuery.sizeOf(context).width;
  final base = (w * 0.62).clamp(272.0, 360.0);
  if (textLen > 100) return base + 56;
  if (textLen > 70) return base + 36;
  if (textLen > 45) return base + 16;
  return base;
}

/// 每日经文与 PWA Hero 一致：固定 16px，不随字数缩小。
///
/// 卡片高度会随长经文增加，避免以牺牲可读性来换取一屏塞下。
double homeHeroVerseFontSize(int textLen) => 16;

/// 最大行数：宁多行展全，不用省略号吃字（全屏壁纸另有完整文）。
int homeHeroVerseMaxLines(int textLen) {
  if (textLen > 110) return 9;
  if (textLen > 80) return 7;
  if (textLen > 50) return 6;
  return 5;
}
