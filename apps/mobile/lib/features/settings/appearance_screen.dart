/// 外观设置（对齐 Web /profile/appearance）。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart' show prefsProvider;
import '../../core/app_theme.dart';
import '../../core/theme.dart';
import '../bible/reader_experience.dart';
import '../bible/reader_preferences.dart';
import '../bible/reader_settings_menu.dart';

class AppearanceScreen extends ConsumerStatefulWidget {
  const AppearanceScreen({super.key});

  @override
  ConsumerState<AppearanceScreen> createState() => _AppearanceScreenState();
}

class _AppearanceScreenState extends ConsumerState<AppearanceScreen> {
  bool _followApp = false;

  @override
  void initState() {
    super.initState();
    _followApp = readerFollowsAppTheme(ref.read(prefsProvider));
  }

  @override
  Widget build(BuildContext context) {
    final appTheme = ref.watch(appThemeProvider);
    final readerTheme = ref.watch(readerExperienceThemeProvider);
    final fontFamily = ref.watch(readerFontFamilyProvider);
    final pageTurn = ref.watch(readerPageTurnProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('外观')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        children: [
          const Text('应用主题',
              style: TextStyle(
                  fontWeight: FontWeight.w700, color: AppColors.ink)),
          const SizedBox(height: 4),
          const Text('影响首页、群页、Tab 等全站界面',
              style: TextStyle(fontSize: 13, color: AppColors.inkFaint)),
          const SizedBox(height: 12),
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            childAspectRatio: 1.5,
            children: AppThemeId.values.map((t) {
              final active = appTheme == t;
              return InkWell(
                onTap: () => ref.read(appThemeProvider.notifier).set(t),
                borderRadius: BorderRadius.circular(14),
                child: Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: t.preview,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                      color: active ? AppColors.accentDeep : AppColors.line,
                      width: active ? 2 : 1,
                    ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(t.label,
                          style: TextStyle(
                              fontWeight: FontWeight.w700,
                              color: t == AppThemeId.dark
                                  ? Colors.white
                                  : AppColors.ink)),
                      const SizedBox(height: 4),
                      Text(t.desc,
                          style: TextStyle(
                              fontSize: 11,
                              color: t == AppThemeId.dark
                                  ? Colors.white70
                                  : AppColors.inkSoft)),
                    ],
                  ),
                ),
              );
            }).toList(),
          ),
          const SizedBox(height: 8),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('阅读主题跟随应用'),
            value: _followApp,
            onChanged: (v) async {
              setState(() => _followApp = v);
              await setReaderFollowsAppTheme(ref.read(prefsProvider), v);
              if (v) {
                ref.read(readerExperienceThemeProvider.notifier).set(
                      readerThemeForApp(ref.read(appThemeProvider)),
                    );
              }
            },
          ),
          const Divider(height: 28),
          const Text('阅读主题',
              style: TextStyle(
                  fontWeight: FontWeight.w700, color: AppColors.ink)),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            children: ReaderExperienceTheme.values.map((t) {
              return ChoiceChip(
                label: Text(t.label),
                selected: readerTheme == t,
                onSelected: (_) {
                  setState(() => _followApp = false);
                  setReaderFollowsAppTheme(ref.read(prefsProvider), false);
                  ref.read(readerExperienceThemeProvider.notifier).set(t);
                },
                selectedColor: AppColors.accentWash,
              );
            }).toList(),
          ),
          const Divider(height: 28),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('完整阅读设置'),
            trailing: const Icon(Icons.chevron_right, color: AppColors.inkFaint),
            onTap: () => showReaderSettingsSheet(context, ref),
          ),
          Wrap(
            spacing: 8,
            children: ReaderFontFamily.values.map((f) {
              return ChoiceChip(
                label: Text(f.label),
                selected: fontFamily == f,
                onSelected: (_) =>
                    ref.read(readerFontFamilyProvider.notifier).set(f),
                selectedColor: AppColors.accentWash,
              );
            }).toList(),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            children: ReaderPageTurn.values.map((p) {
              return ChoiceChip(
                label: Text(p.label),
                selected: pageTurn == p,
                onSelected: (_) =>
                    ref.read(readerPageTurnProvider.notifier).set(p),
                selectedColor: AppColors.accentWash,
              );
            }).toList(),
          ),
        ],
      ),
    );
  }
}
