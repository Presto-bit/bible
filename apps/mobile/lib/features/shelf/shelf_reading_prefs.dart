/// 书架阅读偏好（字号 / 行距 / 字体族，对齐 Web shelf_reading）。
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/api_client.dart';

const _fontKey = 'shelf_font_px';
const _lineHeightKey = 'shelf_line_height';
const _fontFamilyKey = 'shelf_font_family';
const _lineHeightManualKey = 'shelf_line_height_manual';

const shelfFontSteps = [18.0, 20.0, 24.0];
const shelfLineHeightSteps = [1.75, 1.9, 2.05, 2.2];

const shelfFontStepLabels = {
  18.0: '中',
  20.0: '大',
  24.0: '特大',
};

const shelfLineHeightLabels = {
  1.75: '紧凑',
  1.9: '标准',
  2.05: '宽松',
  2.2: '更宽',
};

enum ShelfFontFamily { serif, sans }

const shelfFontFamilyLabels = {
  ShelfFontFamily.serif: '衬线',
  ShelfFontFamily.sans: '黑体',
};

double shelfDefaultLineHeight(double fontPx) => fontPx >= 24 ? 2.05 : 1.9;

class ShelfReadingPrefs {
  const ShelfReadingPrefs({
    required this.fontPx,
    required this.lineHeight,
    required this.fontFamily,
    this.lineHeightManual = false,
  });

  final double fontPx;
  final double lineHeight;
  final ShelfFontFamily fontFamily;
  final bool lineHeightManual;
}

class ShelfReadingPrefsNotifier extends Notifier<ShelfReadingPrefs> {
  @override
  ShelfReadingPrefs build() {
    final prefs = ref.read(prefsProvider);
    final font = prefs.getDouble(_fontKey) ?? 18.0;
    final lh = prefs.getDouble(_lineHeightKey) ?? 1.9;
    final familyRaw = prefs.getString(_fontFamilyKey);
    final manual = prefs.getBool(_lineHeightManualKey) ?? false;
    final fontPx = shelfFontSteps.contains(font) ? font : 18.0;
    final lineHeight = shelfLineHeightSteps.contains(lh)
        ? lh
        : shelfDefaultLineHeight(fontPx);
    return ShelfReadingPrefs(
      fontPx: fontPx,
      lineHeight: lineHeight,
      fontFamily: familyRaw == 'sans' ? ShelfFontFamily.sans : ShelfFontFamily.serif,
      lineHeightManual: manual,
    );
  }

  Future<void> setFontPx(double px) async {
    final prefs = ref.read(prefsProvider);
    final nearest = shelfFontSteps.reduce(
      (a, b) => (b - px).abs() < (a - px).abs() ? b : a,
    );
    await prefs.setDouble(_fontKey, nearest);
    var lh = state.lineHeight;
    if (!state.lineHeightManual) {
      lh = shelfDefaultLineHeight(nearest);
      await prefs.setDouble(_lineHeightKey, lh);
    }
    state = ShelfReadingPrefs(
      fontPx: nearest,
      lineHeight: lh,
      fontFamily: state.fontFamily,
      lineHeightManual: state.lineHeightManual,
    );
  }

  Future<void> setLineHeight(double lh) async {
    final nearest = shelfLineHeightSteps.reduce(
      (a, b) => (b - lh).abs() < (a - lh).abs() ? b : a,
    );
    final prefs = ref.read(prefsProvider);
    await prefs.setDouble(_lineHeightKey, nearest);
    await prefs.setBool(_lineHeightManualKey, true);
    state = ShelfReadingPrefs(
      fontPx: state.fontPx,
      lineHeight: nearest,
      fontFamily: state.fontFamily,
      lineHeightManual: true,
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
      lineHeightManual: state.lineHeightManual,
    );
  }
}

final shelfReadingPrefsProvider =
    NotifierProvider<ShelfReadingPrefsNotifier, ShelfReadingPrefs>(
  ShelfReadingPrefsNotifier.new,
);
