/// 阅读划线：样式与颜色常量。
library;

import 'package:flutter/material.dart';

import '../../core/theme.dart';

enum HighlightStyle {
  colorLine,
  solid,
  dashed,
}

extension HighlightStyleX on HighlightStyle {
  String get key => switch (this) {
        HighlightStyle.colorLine => 'color',
        HighlightStyle.solid => 'solid',
        HighlightStyle.dashed => 'dashed',
      };

  String get label => switch (this) {
        HighlightStyle.colorLine => '色线',
        HighlightStyle.solid => '直线',
        HighlightStyle.dashed => '虚线',
      };

  static HighlightStyle fromKey(String? raw) => switch (raw) {
        'solid' => HighlightStyle.solid,
        'dashed' => HighlightStyle.dashed,
        _ => HighlightStyle.colorLine,
      };
}

const highlightColorKeys = ['yellow', 'green', 'blue', 'pink', 'orange'];

class HighlightMark {
  const HighlightMark({required this.color, required this.style});
  final String color;
  final HighlightStyle style;
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

TextDecorationStyle decorationStyleFor(HighlightStyle style) =>
    style == HighlightStyle.dashed
        ? TextDecorationStyle.dashed
        : TextDecorationStyle.solid;

TextStyle applyHighlightStyle(
  TextStyle base, {
  required HighlightMark? mark,
  required bool disabled,
}) {
  if (disabled || mark == null) return base;
  final ink = highlightInk(mark.color);
  if (mark.style == HighlightStyle.colorLine) {
    return base.copyWith(
      backgroundColor: highlightFill(mark.color).withValues(alpha: 0.62),
    );
  }
  return base.copyWith(
    decoration: TextDecoration.underline,
    decorationColor: ink,
    decorationStyle: decorationStyleFor(mark.style),
    decorationThickness: mark.style == HighlightStyle.solid ? 1.8 : 1.4,
  );
}

Color chipColor(String key) => highlightFill(key);
