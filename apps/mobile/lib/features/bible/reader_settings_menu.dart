/// 阅读器三点设置菜单 + 完整设置面板。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme.dart';
import 'reader_experience.dart';
import 'reader_preferences.dart';

void showReaderMoreMenu(BuildContext context, WidgetRef ref) {
  showModalBottomSheet<void>(
    context: context,
    backgroundColor: AppColors.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (ctx) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ListTile(
            leading: const Icon(Icons.text_fields_outlined),
            title: const Text('阅读设置'),
            trailing: const Icon(Icons.chevron_right, color: AppColors.inkFaint),
            onTap: () {
              Navigator.pop(ctx);
              showReaderSettingsSheet(context, ref);
            },
          ),
          const Divider(height: 1),
          ListTile(
            leading: const Icon(Icons.close),
            title: const Text('取消'),
            onTap: () => Navigator.pop(ctx),
          ),
        ],
      ),
    ),
  );
}

Future<void> showReaderSettingsSheet(BuildContext context, WidgetRef ref) async {
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
                      onSelected: (_) =>
                          ref.read(readerExperienceThemeProvider.notifier).set(t),
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
                      onSelected: (_) =>
                          ref.read(readerVerseNumberProvider.notifier).set(e.$2),
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
              ],
            ),
          ),
        );
      },
    ),
  );
}

Widget _section(String title) => Padding(
      padding: const EdgeInsets.only(top: 14, bottom: 8),
      child: Text(title,
          style: const TextStyle(fontSize: 12, color: AppColors.inkFaint)),
    );
