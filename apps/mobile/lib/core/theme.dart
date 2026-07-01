/// 「静穆温润」设计令牌 —— 与 canvas demo 的纸感配色保持一致。
library;

import 'package:flutter/material.dart';

class AppColors {
  // 纸面与墨色
  static const paper = Color(0xFFF7F4EE); // 主背景（暖纸）
  static const surface = Color(0xFFFFFDF8); // 卡片面
  static const surfaceSunken = Color(0xFFF1ECE3); // 凹陷/分隔
  static const ink = Color(0xFF2B2A28); // 主文字（墨）
  static const inkSoft = Color(0xFF6B6660); // 次要文字
  static const inkFaint = Color(0xFF9A938A); // 弱化文字
  static const line = Color(0xFFE7E0D5); // 描边

  // 主题强调：温润橄榄绿
  static const accent = Color(0xFF6E8B6E);
  static const accentDeep = Color(0xFF52684F);
  static const accentWash = Color(0xFFEDF1E9);

  // 辅助：经文金棕（脚注/引用）
  static const gold = Color(0xFFB08953);
  static const goldWash = Color(0xFFF5EEDF);
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

    return base.copyWith(
      textTheme: base.textTheme.apply(
        bodyColor: AppColors.ink,
        displayColor: AppColors.ink,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: AppColors.paper,
        foregroundColor: AppColors.ink,
        elevation: 0,
        centerTitle: false,
        scrolledUnderElevation: 0,
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
