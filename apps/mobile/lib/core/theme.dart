/// 「晨光」设计令牌 —— App 全 Tab 统一壳层配色与字体体系。
library;

import 'package:flutter/material.dart';

class AppColors {
  static const paper = Color(0xFFFFFCFA);
  static const surface = Color(0xFFFFFFFF);
  static const surfaceSunken = Color(0xFFF5F5F7);
  static const ink = Color(0xFF1C1C1E);
  static const inkSoft = Color(0xFF48484A);
  static const inkFaint = Color(0xFF8E8E93);
  static const line = Color(0xFFE5E5EA);

  // 主题强调：温润橄榄绿
  static const accent = Color(0xFF6E8B6E);
  static const accentDeep = Color(0xFF52684F);
  static const accentWash = Color(0xFFEEF4F0);

  // 辅助：经文金棕（脚注/引用）
  static const gold = Color(0xFFB08953);
  static const goldWash = Color(0xFFF8F2E8);
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
  static ThemeData light() {
    final base = ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      scaffoldBackgroundColor: AppColors.paper,
      colorScheme: ColorScheme.fromSeed(
        seedColor: AppColors.accent,
        brightness: Brightness.light,
        surface: AppColors.surface,
      ).copyWith(
        primary: AppColors.accentDeep,
        secondary: AppColors.gold,
      ),
      fontFamily: null, // 用系统字体（中文 PingFang）
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
        bodyColor: AppColors.ink,
        displayColor: AppColors.ink,
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: AppColors.paper,
        foregroundColor: AppColors.ink,
        elevation: 0,
        centerTitle: false,
        scrolledUnderElevation: 0,
        titleTextStyle: AppTypography.title,
      ),
      dividerColor: AppColors.line,
      cardTheme: CardThemeData(
        color: AppColors.surface,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
          side: const BorderSide(color: AppColors.line),
        ),
      ),
    );
  }
}
