/// 阅读器偏好：翻页、字体、划线/想法开关等。
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/api_client.dart';

enum ReaderFontFamily { serif, sans }

extension ReaderFontFamilyX on ReaderFontFamily {
  String get label => switch (this) {
        ReaderFontFamily.serif => '衬线',
        ReaderFontFamily.sans => '黑体',
      };
  String? get fontFamily => switch (this) {
        ReaderFontFamily.serif => 'Georgia',
        ReaderFontFamily.sans => null,
      };
}

enum ReaderPageTurn { swipe, scroll }

extension ReaderPageTurnX on ReaderPageTurn {
  String get label => switch (this) {
        ReaderPageTurn.swipe => '左右滑动',
        ReaderPageTurn.scroll => '上下滚动',
      };
}

const _fontFamilyKey = 'reader_font_family';
const _pageTurnKey = 'reader_page_turn';
const _underlinesOffKey = 'reader_underlines_off';
const _thoughtsOffKey = 'reader_thoughts_off';

class ReaderPreferences {
  ReaderPreferences(this._prefs);
  final SharedPreferences _prefs;

  ReaderFontFamily get fontFamily => ReaderFontFamily.values.firstWhere(
        (e) => e.name == _prefs.getString(_fontFamilyKey),
        orElse: () => ReaderFontFamily.serif,
      );

  Future<void> setFontFamily(ReaderFontFamily v) =>
      _prefs.setString(_fontFamilyKey, v.name);

  ReaderPageTurn get pageTurn => ReaderPageTurn.values.firstWhere(
        (e) => e.name == _prefs.getString(_pageTurnKey),
        orElse: () => ReaderPageTurn.swipe,
      );

  Future<void> setPageTurn(ReaderPageTurn v) =>
      _prefs.setString(_pageTurnKey, v.name);

  bool get underlinesEnabled => !(_prefs.getBool(_underlinesOffKey) ?? false);
  bool get thoughtsEnabled => !(_prefs.getBool(_thoughtsOffKey) ?? false);

  Future<void> setUnderlinesEnabled(bool v) =>
      _prefs.setBool(_underlinesOffKey, !v);

  Future<void> setThoughtsEnabled(bool v) =>
      _prefs.setBool(_thoughtsOffKey, !v);
}

final readerPreferencesProvider = Provider<ReaderPreferences>(
  (ref) => ReaderPreferences(ref.watch(prefsProvider)),
);

class ReaderFontFamilyNotifier extends Notifier<ReaderFontFamily> {
  @override
  ReaderFontFamily build() =>
      ref.read(readerPreferencesProvider).fontFamily;

  Future<void> set(ReaderFontFamily v) async {
    state = v;
    await ref.read(readerPreferencesProvider).setFontFamily(v);
  }
}

final readerFontFamilyProvider =
    NotifierProvider<ReaderFontFamilyNotifier, ReaderFontFamily>(
        ReaderFontFamilyNotifier.new);

class ReaderPageTurnNotifier extends Notifier<ReaderPageTurn> {
  @override
  ReaderPageTurn build() => ref.read(readerPreferencesProvider).pageTurn;

  Future<void> set(ReaderPageTurn v) async {
    state = v;
    await ref.read(readerPreferencesProvider).setPageTurn(v);
  }
}

final readerPageTurnProvider =
    NotifierProvider<ReaderPageTurnNotifier, ReaderPageTurn>(
        ReaderPageTurnNotifier.new);

class ReaderFeatureTogglesNotifier extends Notifier<({bool underlines, bool thoughts})> {
  @override
  ({bool underlines, bool thoughts}) build() {
    final p = ref.read(readerPreferencesProvider);
    return (underlines: p.underlinesEnabled, thoughts: p.thoughtsEnabled);
  }

  Future<void> setUnderlines(bool v) async {
    await ref.read(readerPreferencesProvider).setUnderlinesEnabled(v);
    state = (underlines: v, thoughts: state.thoughts);
  }

  Future<void> setThoughts(bool v) async {
    await ref.read(readerPreferencesProvider).setThoughtsEnabled(v);
    state = (underlines: state.underlines, thoughts: v);
  }
}

final readerFeatureTogglesProvider =
    NotifierProvider<ReaderFeatureTogglesNotifier,
        ({bool underlines, bool thoughts})>(ReaderFeatureTogglesNotifier.new);
