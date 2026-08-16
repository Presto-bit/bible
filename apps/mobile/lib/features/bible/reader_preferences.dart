/// 阅读器偏好：翻页、字体、划线/想法、阅读模式、章末提示等。
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
    // Android 优先 Noto Serif CJK SC；PWA 用同一 Noto Serif SC 字形。
    ReaderFontFamily.serif => 'Noto Serif SC',
    ReaderFontFamily.sans => null,
  };

  /// fontFamilyFallback 给 TextStyle 用。
  List<String> get fontFamilyFallback => switch (this) {
    ReaderFontFamily.serif => const [
      'Noto Serif CJK SC',
      'Source Han Serif SC',
      'Songti SC',
      'STSong',
      'Georgia',
      'serif',
    ],
    ReaderFontFamily.sans => const [
      'Noto Sans SC',
      'PingFang SC',
      'sans-serif',
    ],
  };
}

enum ReaderPageTurn { swipe, scroll }

extension ReaderPageTurnX on ReaderPageTurn {
  String get label => switch (this) {
    ReaderPageTurn.swipe => '左右滑动',
    ReaderPageTurn.scroll => '上下滚动',
  };
}

/// 专注=少干扰；默想=读后留痕；查经=工具齐全（默认）。对齐 Web `ReadingMode`。
enum ReadingMode { focus, meditate, study }

extension ReadingModeX on ReadingMode {
  String get label => switch (this) {
    ReadingMode.focus => '专注',
    ReadingMode.meditate => '默想',
    ReadingMode.study => '查经',
  };
  String get hint => switch (this) {
    ReadingMode.focus => '少干扰，适合连续读',
    ReadingMode.meditate => '读后留一句回应',
    ReadingMode.study => '工具齐全（默认）',
  };
}

/// 单栏 / 译本对照。对齐 Web `reader_layout`。
enum ReadingLayout { single, parallel }

extension ReadingLayoutX on ReadingLayout {
  String get label => switch (this) {
    ReadingLayout.single => '单栏',
    ReadingLayout.parallel => '译本对照',
  };
}

const _fontFamilyKey = 'reader_font_family';
const _pageTurnKey = 'reader_page_turn';
const _underlinesOffKey = 'reader_underlines_off';
const _thoughtsOffKey = 'reader_thoughts_off';
const _readingModeKey = 'reader_reading_mode';
const _layoutKey = 'reader_layout';
const _chapterTipOffKey = 'reader_chapter_complete_tip_off';
const _chapterTipShownKey = 'reader_chapter_complete_tip_shown_v1';
const _parallelDiffOffKey = 'reader_parallel_diff_off';

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

  ReadingMode get readingMode {
    final v = _prefs.getString(_readingModeKey);
    return ReadingMode.values.firstWhere(
      (e) => e.name == v,
      orElse: () => ReadingMode.study,
    );
  }

  Future<void> setReadingMode(ReadingMode v) =>
      _prefs.setString(_readingModeKey, v.name);

  ReadingLayout get layout {
    final v = _prefs.getString(_layoutKey);
    return ReadingLayout.values.firstWhere(
      (e) => e.name == v,
      orElse: () => ReadingLayout.single,
    );
  }

  Future<void> setLayout(ReadingLayout v) =>
      _prefs.setString(_layoutKey, v.name);

  bool get chapterCompleteTipOn =>
      !(_prefs.getBool(_chapterTipOffKey) ?? false);

  Future<void> setChapterCompleteTipOn(bool v) =>
      _prefs.setBool(_chapterTipOffKey, !v);

  bool hasShownChapterCompleteTip(String bookId, int chapter) {
    final key = '${bookId.toUpperCase()}.$chapter';
    final raw = _prefs.getStringList(_chapterTipShownKey) ?? const [];
    return raw.contains(key);
  }

  Future<void> markChapterCompleteTipShown(String bookId, int chapter) async {
    final key = '${bookId.toUpperCase()}.$chapter';
    final raw = List<String>.from(
      _prefs.getStringList(_chapterTipShownKey) ?? const <String>[],
    );
    if (raw.contains(key)) return;
    raw.add(key);
    // 控制增长：只留最近 120 条
    while (raw.length > 120) {
      raw.removeAt(0);
    }
    await _prefs.setStringList(_chapterTipShownKey, raw);
  }

  /// 对照阅读时标示措辞差（默认关，对齐 PWA；仅查经模式可开启）。
  bool get parallelDiffOn => !(_prefs.getBool(_parallelDiffOffKey) ?? true);

  Future<void> setParallelDiffOn(bool v) =>
      _prefs.setBool(_parallelDiffOffKey, !v);
}

final readerPreferencesProvider = Provider<ReaderPreferences>(
  (ref) => ReaderPreferences(ref.watch(prefsProvider)),
);

class ReaderFontFamilyNotifier extends Notifier<ReaderFontFamily> {
  @override
  ReaderFontFamily build() => ref.read(readerPreferencesProvider).fontFamily;

  Future<void> set(ReaderFontFamily v) async {
    state = v;
    await ref.read(readerPreferencesProvider).setFontFamily(v);
  }
}

final readerFontFamilyProvider =
    NotifierProvider<ReaderFontFamilyNotifier, ReaderFontFamily>(
      ReaderFontFamilyNotifier.new,
    );

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
      ReaderPageTurnNotifier.new,
    );

class ReaderFeatureTogglesNotifier
    extends Notifier<({bool underlines, bool thoughts})> {
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
    NotifierProvider<
      ReaderFeatureTogglesNotifier,
      ({bool underlines, bool thoughts})
    >(ReaderFeatureTogglesNotifier.new);

class ReadingModeNotifier extends Notifier<ReadingMode> {
  @override
  ReadingMode build() => ref.read(readerPreferencesProvider).readingMode;

  Future<void> set(ReadingMode v) async {
    state = v;
    await ref.read(readerPreferencesProvider).setReadingMode(v);
  }
}

final readingModeProvider = NotifierProvider<ReadingModeNotifier, ReadingMode>(
  ReadingModeNotifier.new,
);

class ReadingLayoutNotifier extends Notifier<ReadingLayout> {
  @override
  ReadingLayout build() => ref.read(readerPreferencesProvider).layout;

  Future<void> set(ReadingLayout v) async {
    state = v;
    await ref.read(readerPreferencesProvider).setLayout(v);
  }
}

final readingLayoutProvider =
    NotifierProvider<ReadingLayoutNotifier, ReadingLayout>(
      ReadingLayoutNotifier.new,
    );

class ChapterCompleteTipToggleNotifier extends Notifier<bool> {
  @override
  bool build() => ref.read(readerPreferencesProvider).chapterCompleteTipOn;

  Future<void> set(bool v) async {
    state = v;
    await ref.read(readerPreferencesProvider).setChapterCompleteTipOn(v);
  }
}

final chapterCompleteTipOnProvider =
    NotifierProvider<ChapterCompleteTipToggleNotifier, bool>(
      ChapterCompleteTipToggleNotifier.new,
    );

class ParallelDiffToggleNotifier extends Notifier<bool> {
  @override
  bool build() => ref.read(readerPreferencesProvider).parallelDiffOn;

  Future<void> set(bool v) async {
    state = v;
    await ref.read(readerPreferencesProvider).setParallelDiffOn(v);
  }
}

final parallelDiffOnProvider =
    NotifierProvider<ParallelDiffToggleNotifier, bool>(
      ParallelDiffToggleNotifier.new,
    );
