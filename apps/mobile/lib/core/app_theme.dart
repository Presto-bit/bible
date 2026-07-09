/// 全站应用主题（对齐 Web app_theme.ts）：典雅白 / 晨曦 / 护眼黄 / 深色。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api_client.dart' show prefsProvider;
import '../features/bible/reader_experience.dart';

enum AppThemeId { classic, dawn, sepia, dark }

extension AppThemeIdX on AppThemeId {
  String get storageKey => name;
  String get label => switch (this) {
        AppThemeId.classic => '典雅白',
        AppThemeId.dawn => '晨曦',
        AppThemeId.sepia => '护眼黄',
        AppThemeId.dark => '深色',
      };
  String get desc => switch (this) {
        AppThemeId.classic => '清爽白底',
        AppThemeId.dawn => '暖白晨光',
        AppThemeId.sepia => '柔和纸黄',
        AppThemeId.dark => '夜间深色',
      };
  Color get preview => switch (this) {
        AppThemeId.classic => const Color(0xFFFFFFFF),
        AppThemeId.dawn => const Color(0xFFFFF8F3),
        AppThemeId.sepia => const Color(0xFFF5F0E1),
        AppThemeId.dark => const Color(0xFF12181C),
      };
}

const _appThemeKey = 'app_theme';
const _readerFollowKey = 'reader_follow_app_theme';

ReaderExperienceTheme readerThemeForApp(AppThemeId app) => switch (app) {
      AppThemeId.dark => ReaderExperienceTheme.night,
      AppThemeId.sepia => ReaderExperienceTheme.sepia,
      _ => ReaderExperienceTheme.morning,
    };

bool readerFollowsAppTheme(SharedPreferences prefs) =>
    prefs.getBool(_readerFollowKey) ?? false;

Future<void> setReaderFollowsAppTheme(SharedPreferences prefs, bool v) =>
    prefs.setBool(_readerFollowKey, v);

class AppThemeNotifier extends Notifier<AppThemeId> {
  @override
  AppThemeId build() {
    final raw = ref.read(prefsProvider).getString(_appThemeKey);
    return AppThemeId.values.firstWhere(
      (e) => e.storageKey == raw,
      orElse: () => AppThemeId.classic,
    );
  }

  Future<void> set(AppThemeId id) async {
    state = id;
    await ref.read(prefsProvider).setString(_appThemeKey, id.storageKey);
    if (readerFollowsAppTheme(ref.read(prefsProvider))) {
      ref
          .read(readerExperienceThemeProvider.notifier)
          .set(readerThemeForApp(id));
    }
  }
}

final appThemeProvider =
    NotifierProvider<AppThemeNotifier, AppThemeId>(AppThemeNotifier.new);
