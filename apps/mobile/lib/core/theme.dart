/// 「晨光」设计令牌 —— App 全 Tab 统一壳层配色与字体体系。
library;

import 'package:flutter/material.dart';

import 'app_theme.dart' show AppThemeId;

class AppColors {
  // 经典主题静态兜底值；新界面应优先读取 Theme / PeiaiThemeColors。
  static const paper = Color(0xFFFFFFFF);
  static const surface = Color(0xFFFFFFFF);
  static const surfaceSunken = Color(0xFFF7F7F7);
  static const ink = Color(0xFF191919);
  static const inkSoft = Color(0xFF666666);
  static const inkFaint = Color(0xFF999999);
  static const line = Color(0xFFEBEBEB);

  // 经典主题强调色（与 PWA design_tokens.css 一致）。
  static const accent = Color(0xFF07C160);
  static const accentDeep = Color(0xFF06AE56);
  static const accentWash = Color(0x1F07C160);

  static const gold = Color(0xFF07C160);
  static const goldWash = Color(0xFFE8F8EF);
}

/// UI 字体阶梯（与 Web `--font-*` 对齐；阅读区单独用 readerBody）
class AppTypography {
  static const double xs = 11;
  static const double sm = 12;
  static const double md = 13;
  static const double base = 15;
  static const double lg = 16;
  static const double xl = 17;
  static const double display = 20;
  static const double readerBody = 18;

  static const TextStyle meta = TextStyle(
    fontSize: sm,
    height: 1.45,
    color: AppColors.inkFaint,
  );

  static const TextStyle secondary = TextStyle(
    fontSize: md,
    height: 1.5,
    color: AppColors.inkSoft,
  );

  static const TextStyle body = TextStyle(
    fontSize: base,
    height: 1.55,
    color: AppColors.ink,
  );

  static const TextStyle title = TextStyle(
    fontSize: xl,
    height: 1.35,
    fontWeight: FontWeight.w600,
    color: AppColors.ink,
  );

  static const TextStyle stat = TextStyle(
    fontSize: md,
    height: 1.4,
    fontWeight: FontWeight.w500,
    color: AppColors.inkSoft,
    fontFeatures: [FontFeature.tabularFigures()],
  );

  static const TextStyle reader = TextStyle(
    fontSize: readerBody,
    height: 1.7,
    color: AppColors.ink,
  );
}

class AppTheme {
  static ThemeData forApp(AppThemeId id) {
    final palette = _palette(id);
    final base = ThemeData(
      useMaterial3: true,
      brightness: id == AppThemeId.dark ? Brightness.dark : Brightness.light,
      scaffoldBackgroundColor: palette.paper,
      colorScheme: ColorScheme.fromSeed(
        seedColor: palette.accent,
        brightness: id == AppThemeId.dark ? Brightness.dark : Brightness.light,
        surface: palette.surface,
      ).copyWith(
        primary: palette.accent,
        secondary: palette.gold,
        surface: palette.surface,
        onSurface: palette.ink,
        outline: palette.line,
      ),
    );

    final textTheme = base.textTheme.copyWith(
      bodySmall: AppTypography.meta,
      bodyMedium: AppTypography.body,
      bodyLarge: AppTypography.body.copyWith(fontSize: AppTypography.lg),
      titleSmall: AppTypography.secondary.copyWith(fontWeight: FontWeight.w600),
      titleMedium: AppTypography.title,
      titleLarge: AppTypography.title.copyWith(fontSize: AppTypography.display),
      labelSmall: AppTypography.meta.copyWith(fontWeight: FontWeight.w600),
      labelMedium: AppTypography.secondary.copyWith(fontWeight: FontWeight.w500),
      labelLarge: AppTypography.body.copyWith(fontWeight: FontWeight.w600),
    );

    return base.copyWith(
      textTheme: textTheme.apply(
        bodyColor: palette.ink,
        displayColor: palette.ink,
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: palette.paper,
        foregroundColor: palette.ink,
        elevation: 0,
        centerTitle: false,
        scrolledUnderElevation: 0,
        titleTextStyle: AppTypography.title.copyWith(color: palette.ink),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: palette.surface.withValues(alpha: 0.92),
        indicatorColor: palette.accent.withValues(alpha: 0.16),
        elevation: 0,
        height: 58,
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          final active = states.contains(WidgetState.selected);
          return TextStyle(
            fontSize: 10,
            fontWeight: active ? FontWeight.w600 : FontWeight.w500,
            color: active ? palette.accentDeep : palette.ink.withValues(alpha: 0.45),
          );
        }),
      ),
      dividerColor: palette.line,
      cardTheme: CardThemeData(
        color: palette.surface,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: BorderSide(color: palette.line),
        ),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: palette.surface,
        surfaceTintColor: Colors.transparent,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
        ),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: palette.surface,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      ),
    );
  }

  static ThemeData light() => forApp(AppThemeId.classic);
}

class _ThemePalette {
  const _ThemePalette({
    required this.paper,
    required this.surface,
    required this.line,
    required this.ink,
    required this.accent,
    required this.accentDeep,
    required this.gold,
  });
  final Color paper;
  final Color surface;
  final Color line;
  final Color ink;
  final Color accent;
  final Color accentDeep;
  final Color gold;
}

_ThemePalette _palette(AppThemeId id) => switch (id) {
      AppThemeId.dark => const _ThemePalette(
            paper: Color(0xFF12181C),
            surface: Color(0xFF1A2228),
            line: Color(0xFF2C353D),
            ink: Color(0xFFE8ECEF),
            accent: Color(0xFF07C160),
            accentDeep: Color(0xFF38CD7F),
            gold: Color(0xFF07C160),
          ),
      AppThemeId.dawn => const _ThemePalette(
            paper: Color(0xFFFFF8F3),
            surface: Color(0xFFFFFFFF),
            line: Color(0xFFF0E4DC),
            ink: Color(0xFF1C1C1E),
            accent: Color(0xFF6A8F72),
            accentDeep: Color(0xFF4A6B52),
            gold: Color(0xFFD4A056),
          ),
      AppThemeId.sepia => const _ThemePalette(
            paper: Color(0xFFF5F0E1),
            surface: Color(0xFFFAF6EB),
            line: Color(0xFFDDD4C0),
            ink: Color(0xFF3D3428),
            accent: Color(0xFF07C160),
            accentDeep: Color(0xFF06AE56),
            gold: Color(0xFFC4956A),
          ),
      _ => const _ThemePalette(
            paper: Color(0xFFFFFFFF),
            surface: Color(0xFFFFFFFF),
            line: Color(0xFFEBEBEB),
            ink: Color(0xFF191919),
            accent: Color(0xFF07C160),
            accentDeep: Color(0xFF06AE56),
            gold: Color(0xFF07C160),
          ),
    };
