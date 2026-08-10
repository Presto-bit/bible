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

/// 经文字号：字多则略缩小，利于一屏展全（仍保可读）。
double homeHeroVerseFontSize(int textLen) {
  if (textLen > 110) return 13.5;
  if (textLen > 85) return 14.5;
  if (textLen > 55) return 15.5;
  return 17;
}

/// 最大行数：宁多行展全，不用省略号吃字（全屏壁纸另有完整文）。
int homeHeroVerseMaxLines(int textLen) {
  if (textLen > 110) return 9;
  if (textLen > 80) return 7;
  if (textLen > 50) return 6;
  return 5;
}
