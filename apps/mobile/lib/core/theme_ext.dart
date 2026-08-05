/// Theme 派生色（替代硬编码 AppColors 常量，跟随 AppThemeId）。
library;

import 'package:flutter/material.dart';

import 'app_theme.dart';
import 'theme.dart';

extension PeiaiThemeColors on BuildContext {
  ColorScheme get peiaiScheme => Theme.of(this).colorScheme;

  Color get peiaiPaper => Theme.of(this).scaffoldBackgroundColor;

  Color get peiaiSurface => peiaiScheme.surface;

  Color get peiaiInk => peiaiScheme.onSurface;

  Color get peiaiInkSoft => peiaiScheme.onSurface.withValues(alpha: 0.72);

  Color get peiaiInkFaint => peiaiScheme.onSurface.withValues(alpha: 0.45);

  Color get peiaiLine => Theme.of(this).dividerColor;

  Color get peiaiAccent => peiaiScheme.primary;

  Color get peiaiAccentDeep => peiaiScheme.primary;

  Color get peiaiAccentWash => peiaiScheme.primary.withValues(alpha: 0.12);

  Color get peiaiGold => peiaiScheme.secondary;

  Color get peiaiSurfaceSunken {
    final paper = peiaiPaper;
    final isDark = Theme.of(this).brightness == Brightness.dark;
    return Color.alphaBlend(
      (isDark ? Colors.white : Colors.black).withValues(alpha: isDark ? 0.06 : 0.04),
      paper,
    );
  }
}

/// 供注入 H5 的 CSS 变量（与 Web brand token 大致对齐）。
Map<String, String> peiaiCssVars(AppThemeId id) {
  final p = switch (id) {
    AppThemeId.dark => (
        paper: '#12181C',
        surface: '#1A2228',
        ink: '#D8E0E6',
        line: '#2C353D',
        accent: '#6E8B6E',
        accentDeep: '#8FB08F',
      ),
    AppThemeId.dawn => (
        paper: '#FFF8F3',
        surface: '#FFFFFF',
        ink: '#1C1C1E',
        line: '#E5E5EA',
        accent: '#6E8B6E',
        accentDeep: '#52684F',
      ),
    AppThemeId.sepia => (
        paper: '#F5F0E1',
        surface: '#FAF6EA',
        ink: '#2C2418',
        line: '#E0D8C8',
        accent: '#6E8B6E',
        accentDeep: '#52684F',
      ),
    AppThemeId.classic => (
        paper: '#FFFCFA',
        surface: '#FFFFFF',
        ink: '#1C1C1E',
        line: '#E5E5EA',
        accent: '#6E8B6E',
        accentDeep: '#52684F',
      ),
  };
  return {
    '--paper': p.paper,
    '--surface': p.surface,
    '--ink': p.ink,
    '--line': p.line,
    '--accent': p.accent,
    '--accent-deep': p.accentDeep,
    '--pwa-bg': p.paper,
    '--brand-bg': p.paper,
    '--brand-surface': p.surface,
    '--brand-ink': p.ink,
    '--brand-line': p.line,
    '--brand-accent-soft': p.accent,
    '--brand-accent-deep': p.accentDeep,
  };
}

Color peiaiPaperFor(AppThemeId id) => switch (id) {
      AppThemeId.dark => const Color(0xFF12181C),
      AppThemeId.dawn => const Color(0xFFFFF8F3),
      AppThemeId.sepia => const Color(0xFFF5F0E1),
      AppThemeId.classic => AppColors.paper,
    };
