/// 阅读设置（对齐 PWA ⋮ 一步入设置）。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/theme.dart';
import 'reader_experience.dart';
import 'reader_preferences.dart';

Future<void> showReaderSettingsSheet(
  BuildContext context,
  WidgetRef ref, {
  void Function(String? mainId, String? compareId, String label)? onLayoutApplied,
}) async {
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppColors.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (ctx) => Consumer(
      builder: (_, ref, __) {
        final theme = ref.watch(readerExperienceThemeProvider);
        final verseNo = ref.watch(readerVerseNumberProvider);
        final fontSize = ref.watch(readerFontProvider);
        final fontFamily = ref.watch(readerFontFamilyProvider);
        final pageTurn = ref.watch(readerPageTurnProvider);
        final toggles = ref.watch(readerFeatureTogglesProvider);
        final mode = ref.watch(readingModeProvider);
        final layout = ref.watch(readingLayoutProvider);
        final tipOn = ref.watch(chapterCompleteTipOnProvider);
        return SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 18, 20, 24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('阅读设置',
                    style: TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 16,
                        color: AppColors.ink)),
                _section('阅读模式'),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: ReadingMode.values.map((m) {
                    return ChoiceChip(
                      label: Text(m.label),
                      selected: m == mode,
                      onSelected: (_) =>
                          ref.read(readingModeProvider.notifier).set(m),
                    );
                  }).toList(),
                ),
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(mode.hint,
                      style: const TextStyle(
                          fontSize: 12, color: AppColors.inkFaint)),
                ),
                _section('布局'),
                Wrap(
                  spacing: 8,
                  children: ReadingLayout.values.map((l) {
                    return ChoiceChip(
                      label: Text(l.label),
                      selected: l == layout,
                      onSelected: (_) async {
                        await ref
                            .read(readingLayoutProvider.notifier)
                            .set(l);
                        final prefs = ref.read(prefsProvider);
                        if (l == ReadingLayout.parallel) {
                          final compare =
                              prefs.getString('reader_parallel_version') ??
                                  'cnv';
                          await prefs.setString(
                              'reader_parallel_version', compare);
                          onLayoutApplied?.call(
                            null,
                            compare,
                            '和合本 · ${_verLabel(compare)}',
                          );
                        } else {
                          await prefs.remove('reader_parallel_version');
                          onLayoutApplied?.call(null, null, '和合本');
                        }
                      },
                    );
                  }).toList(),
                ),
                _section('字体大小'),
                Wrap(
                  spacing: 8,
                  children: ReaderFontSize.values.map((s) {
                    return ChoiceChip(
                      label: Text(s.label),
                      selected: s == fontSize,
                      onSelected: (_) =>
                          ref.read(readerFontProvider.notifier).set(s),
                    );
                  }).toList(),
                ),
                _section('字体样式'),
                Wrap(
                  spacing: 8,
                  children: ReaderFontFamily.values.map((f) {
                    return ChoiceChip(
                      label: Text(f.label),
                      selected: f == fontFamily,
                      onSelected: (_) =>
                          ref.read(readerFontFamilyProvider.notifier).set(f),
                    );
                  }).toList(),
                ),
                _section('翻页方式'),
                Wrap(
                  spacing: 8,
                  children: ReaderPageTurn.values.map((p) {
                    return ChoiceChip(
                      label: Text(p.label),
                      selected: p == pageTurn,
                      onSelected: (_) =>
                          ref.read(readerPageTurnProvider.notifier).set(p),
                    );
                  }).toList(),
                ),
                _section('主题颜色'),
                Wrap(
                  spacing: 8,
                  children: ReaderExperienceTheme.values.map((t) {
                    return ChoiceChip(
                      label: Text(t.label),
                      selected: t == theme,
                      onSelected: (_) => ref
                          .read(readerExperienceThemeProvider.notifier)
                          .set(t),
                    );
                  }).toList(),
                ),
                _section('节号显示'),
                Wrap(
                  spacing: 8,
                  children: [
                    ('内嵌', ReaderVerseNumberMode.inline),
                    ('行首', ReaderVerseNumberMode.margin),
                    ('隐藏', ReaderVerseNumberMode.hidden),
                  ].map((e) {
                    return ChoiceChip(
                      label: Text(e.$1),
                      selected: e.$2 == verseNo,
                      onSelected: (_) => ref
                          .read(readerVerseNumberProvider.notifier)
                          .set(e.$2),
                    );
                  }).toList(),
                ),
                _section('显示选项'),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('显示划线'),
                  subtitle: const Text('关闭后隐藏所有划线样式'),
                  value: toggles.underlines,
                  onChanged: (v) => ref
                      .read(readerFeatureTogglesProvider.notifier)
                      .setUnderlines(v),
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('显示想法'),
                  subtitle: const Text('关闭后隐藏想法虚线与入口'),
                  value: toggles.thoughts,
                  onChanged: (v) => ref
                      .read(readerFeatureTogglesProvider.notifier)
                      .setThoughts(v),
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('读完提示'),
                  subtitle: const Text('滑到章末时轻提示写想法 / 下一章'),
                  value: tipOn,
                  onChanged: (v) => ref
                      .read(chapterCompleteTipOnProvider.notifier)
                      .set(v),
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('对照标差'),
                  subtitle: const Text('译本对照时标出措辞差异（查经模式）'),
                  value: ref.watch(parallelDiffOnProvider),
                  onChanged: (v) =>
                      ref.read(parallelDiffOnProvider.notifier).set(v),
                ),
              ],
            ),
          ),
        );
      },
    ),
  );
}

String _verLabel(String id) {
  switch (id.toLowerCase()) {
    case 'cuvs':
      return '和合本';
    case 'cnv':
      return '新译本';
    case 'contemporary':
      return '当代译本';
    case 'kjv':
      return 'King James Version';
    default:
      return id.toUpperCase();
  }
}

Widget _section(String title) => Padding(
      padding: const EdgeInsets.only(top: 14, bottom: 8),
      child: Text(title,
          style: const TextStyle(fontSize: 12, color: AppColors.inkFaint)),
    );
