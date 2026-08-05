/// 首页 Hero 尺寸，对齐 PWA `.hero-verse`。
library;

import 'package:flutter/widgets.dart';

/// PWA：`min-height: clamp(16.5rem, 60vw, 21.75rem)`（rem≈16）
double homeHeroVerseHeight(BuildContext context) {
  final w = MediaQuery.sizeOf(context).width;
  return (w * 0.6).clamp(264.0, 348.0);
}
