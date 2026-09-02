/// 书架阅读偏好（字号 / 行距 / 字体族，对齐 Web shelf_reading）。
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/api_client.dart';

const _fontKey = 'shelf_font_px';
const _lineHeightKey = 'shelf_line_height';
const _fontFamilyKey = 'shelf_font_family';

const shelfFontSteps = [18.0, 20.0, 24.0];
const shelfLineHeightSteps = [1.75, 1.9, 2.05, 2.2];

enum ShelfFontFamily { serif, sans }

const shelfFontFamilyLabels = {
  ShelfFontFamily.serif: '衬线',
  ShelfFontFamily.sans: '黑体',
};

class ShelfReadingPrefs {
  const ShelfReadingPrefs({
    required this.fontPx,
    required this.lineHeight,
    required this.fontFamily,
  });

  final double fontPx;
  final double lineHeight;
  final ShelfFontFamily fontFamily;
}

class ShelfReadingPrefsNotifier extends Notifier<ShelfReadingPrefs> {
  @override
  ShelfReadingPrefs build() {
    final prefs = ref.read(prefsProvider);
    final font = prefs.getDouble(_fontKey) ?? 18.0;
    final lh = prefs.getDouble(_lineHeightKey) ?? 1.9;
    final familyRaw = prefs.getString(_fontFamilyKey);
    return ShelfReadingPrefs(
      fontPx: shelfFontSteps.contains(font) ? font : 18.0,
      lineHeight: shelfLineHeightSteps.contains(lh) ? lh : 1.9,
      fontFamily: familyRaw == 'sans' ? ShelfFontFamily.sans : ShelfFontFamily.serif,
    );
  }

  Future<void> setFontPx(double px) async {
    final nearest = shelfFontSteps.reduce(
      (a, b) => (b - px).abs() < (a - px).abs() ? b : a,
    );
    await ref.read(prefsProvider).setDouble(_fontKey, nearest);
    state = ShelfReadingPrefs(
      fontPx: nearest,
      lineHeight: state.lineHeight,
      fontFamily: state.fontFamily,
    );
  }

  Future<void> setLineHeight(double lh) async {
    final nearest = shelfLineHeightSteps.reduce(
      (a, b) => (b - lh).abs() < (a - lh).abs() ? b : a,
    );
    await ref.read(prefsProvider).setDouble(_lineHeightKey, nearest);
    state = ShelfReadingPrefs(
      fontPx: state.fontPx,
      lineHeight: nearest,
      fontFamily: state.fontFamily,
    );
  }

  Future<void> setFontFamily(ShelfFontFamily family) async {
    await ref.read(prefsProvider).setString(
          _fontFamilyKey,
          family == ShelfFontFamily.sans ? 'sans' : 'serif',
        );
    state = ShelfReadingPrefs(
      fontPx: state.fontPx,
      lineHeight: state.lineHeight,
      fontFamily: family,
    );
  }
}

final shelfReadingPrefsProvider =
    NotifierProvider<ShelfReadingPrefsNotifier, ShelfReadingPrefs>(
  ShelfReadingPrefsNotifier.new,
);
