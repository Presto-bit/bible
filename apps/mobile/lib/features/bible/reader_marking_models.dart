/// 阅读划线：颜色语义与渲染（仅底纹，无实线/虚线）。
library;

import 'package:flutter/material.dart';

import '../../core/theme.dart';

const highlightColorKeys = ['yellow', 'green', 'blue', 'pink', 'orange'];

const markColorSemantics = {
  'yellow': '金句',
  'green': '应许',
  'blue': '教导',
  'pink': '疑问',
  'orange': '应用',
};

class HighlightMark {
  const HighlightMark({required this.color});
  final String color;

  String get semanticLabel => markColorSemantics[color] ?? '划线';
}

Color highlightInk(String color) => switch (color) {
      'green' => const Color(0xFF2D6A4F),
      'blue' => const Color(0xFF1D4E89),
      'pink' => const Color(0xFF9D4E6C),
      'orange' => const Color(0xFFB86B00),
      _ => const Color(0xFFB8860B),
    };

Color highlightFill(String color) => switch (color) {
      'green' => const Color(0xFFCFE3C4),
      'blue' => const Color(0xFFC8D8EA),
      'pink' => const Color(0xFFEED2D8),
      'orange' => const Color(0xFFF5DFC4),
      _ => const Color(0xFFF6E7A8),
    };

TextStyle applyHighlightStyle(
  TextStyle base, {
  required HighlightMark? mark,
  required bool disabled,
  bool flash = false,
}) {
  if (disabled || mark == null) return base;
  return base.copyWith(
    backgroundColor: highlightFill(mark.color).withValues(
      alpha: flash ? 0.88 : 0.62,
    ),
  );
}

Color chipColor(String key) => highlightFill(key);

class VerseMarkInfo {
  const VerseMarkInfo({required this.mark, required this.ref, this.spanStart, this.spanEnd});
  final HighlightMark mark;
  final String ref;
  final int? spanStart;
  final int? spanEnd;
}
