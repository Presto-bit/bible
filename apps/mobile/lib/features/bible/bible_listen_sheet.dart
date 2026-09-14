/// AI 听经全屏播放面。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme.dart';
import 'bible_listen_controller.dart';

Future<void> showBibleListenSheet(BuildContext context, WidgetRef ref) async {
  final ctrl = ref.read(bibleListenProvider.notifier);
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    barrierColor: Colors.black.withValues(alpha: 0.42),
    builder: (ctx) {
      return const _BibleListenSheetBody();
    },
  ).whenComplete(() {
    ctrl.closeSheet();
  });
}

class _BibleListenSheetBody extends ConsumerStatefulWidget {
  const _BibleListenSheetBody();

  @override
  ConsumerState<_BibleListenSheetBody> createState() =>
      _BibleListenSheetBodyState();
}

class _BibleListenSheetBodyState extends ConsumerState<_BibleListenSheetBody> {
  String _panel = 'none';

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(bibleListenProvider);
    final ctrl = ref.read(bibleListenProvider.notifier);
    final preparing = session.ui == BibleListenUi.preparing;
    final playing = session.ui == BibleListenUi.playing;
    final errored = session.ui == BibleListenUi.error;
    final maxMs = session.duration.inMilliseconds <= 0
        ? 1.0
        : session.duration.inMilliseconds.toDouble();
    final posMs = session.position.inMilliseconds
        .clamp(0, session.duration.inMilliseconds)
        .toDouble();

    return DraggableScrollableSheet(
      initialChildSize: 0.88,
      minChildSize: 0.45,
      maxChildSize: 0.95,
      snap: true,
      builder: (context, scrollController) {
        return Container(
          decoration: BoxDecoration(
            borderRadius: const BorderRadius.vertical(top: Radius.circular(22)),
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                Color.lerp(AppColors.paper, AppColors.accent, 0.08)!,
                AppColors.surface,
              ],
            ),
            boxShadow: const [
              BoxShadow(
                color: Color(0x2E000000),
                blurRadius: 28,
                offset: Offset(0, -6),
              ),
            ],
          ),
          child: SafeArea(
            top: false,
            child: ListView(
              controller: scrollController,
              padding: const EdgeInsets.fromLTRB(22, 10, 22, 24),
              children: [
                Center(
                  child: Container(
                    width: 36,
                    height: 4,
                    margin: const EdgeInsets.only(bottom: 10),
                    decoration: BoxDecoration(
                      color: AppColors.inkSoft.withValues(alpha: 0.35),
                      borderRadius: BorderRadius.circular(99),
                    ),
                  ),
                ),
                const Text(
                  '下滑可继续听',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 12, color: AppColors.inkSoft),
                ),
                const SizedBox(height: 6),
                Text(
                  '${session.bookName} ${session.chapter}',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w600,
                    color: AppColors.ink,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  session.translationLabel,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 13,
                    color: AppColors.inkSoft,
                  ),
                ),
                const SizedBox(height: 18),
                ConstrainedBox(
                  constraints: const BoxConstraints(minHeight: 140),
                  child: Text(
                    preparing && session.verseText.isEmpty
                        ? '正在准备听读…'
                        : (session.verseText.isEmpty ? ' ' : session.verseText),
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 19,
                      height: 1.75,
                      color: AppColors.ink,
                      letterSpacing: 0.3,
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                SliderTheme(
                  data: SliderTheme.of(context).copyWith(
                    trackHeight: 3,
                    thumbShape:
                        const RoundSliderThumbShape(enabledThumbRadius: 7),
                  ),
                  child: Slider(
                    value: posMs,
                    max: maxMs,
                    onChanged: !session.canSeek || preparing
                        ? null
                        : (v) => ctrl.seekMs(v.round()),
                  ),
                ),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      formatListenTime(session.position),
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.inkSoft,
                      ),
                    ),
                    Text(
                      formatListenTime(session.duration),
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.inkSoft,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    IconButton(
                      onPressed:
                          preparing ? null : () => ctrl.stepVerse(-1),
                      icon: const Text('‹‹', style: TextStyle(fontSize: 22)),
                    ),
                    const SizedBox(width: 18),
                    Material(
                      color: AppColors.accentDeep,
                      shape: const CircleBorder(),
                      elevation: 3,
                      child: InkWell(
                        customBorder: const CircleBorder(),
                        onTap: preparing ? null : () => ctrl.togglePlayPause(),
                        child: SizedBox(
                          width: 68,
                          height: 68,
                          child: Center(
                            child: preparing
                                ? const SizedBox(
                                    width: 22,
                                    height: 22,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2.2,
                                      color: Colors.white,
                                    ),
                                  )
                                : Text(
                                    playing ? '‖' : '▶',
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 26,
                                    ),
                                  ),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 18),
                    IconButton(
                      onPressed: preparing ? null : () => ctrl.stepVerse(1),
                      icon: const Text('››', style: TextStyle(fontSize: 22)),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  preparing
                      ? '正在准备'
                      : (errored
                          ? (session.error ?? '准备失败，点按重试')
                          : ' '),
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 13,
                    color: errored ? const Color(0xFFA0483A) : AppColors.inkSoft,
                  ),
                ),
                const SizedBox(height: 10),
                Wrap(
                  alignment: WrapAlignment.center,
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    _chip(
                      label: '语速 ${session.settings.speed}×',
                      on: _panel == 'speed',
                      onTap: () => setState(
                        () => _panel = _panel == 'speed' ? 'none' : 'speed',
                      ),
                    ),
                    _chip(label: '沉稳男声', on: false, onTap: null),
                    _chip(
                      label: session.settings.sleepMinutes == null
                          ? '定时'
                          : '定时 ${session.settings.sleepMinutes}′',
                      on: _panel == 'sleep',
                      onTap: () => setState(
                        () => _panel = _panel == 'sleep' ? 'none' : 'sleep',
                      ),
                    ),
                    _chip(
                      label: session.settings.continuousChapter ? '续听开' : '续听关',
                      on: session.settings.continuousChapter,
                      onTap: () => ctrl.updateSettings(
                        session.settings.copyWith(
                          continuousChapter: !session.settings.continuousChapter,
                        ),
                      ),
                    ),
                  ],
                ),
                if (_panel == 'speed') ...[
                  const SizedBox(height: 10),
                  Wrap(
                    alignment: WrapAlignment.center,
                    spacing: 8,
                    children: [0.8, 1.0, 1.25, 1.5].map((s) {
                      return _chip(
                        label: '$s×',
                        on: session.settings.speed == s,
                        onTap: () {
                          ctrl.updateSettings(session.settings.copyWith(speed: s));
                          setState(() => _panel = 'none');
                        },
                      );
                    }).toList(),
                  ),
                ],
                if (_panel == 'sleep') ...[
                  const SizedBox(height: 10),
                  Wrap(
                    alignment: WrapAlignment.center,
                    spacing: 8,
                    children: [
                      (null, '关'),
                      (15, '15 分'),
                      (30, '30 分'),
                      (60, '60 分'),
                    ].map((e) {
                      final minutes = e.$1;
                      return _chip(
                        label: e.$2,
                        on: session.settings.sleepMinutes == minutes,
                        onTap: () {
                          ctrl.armSleep(minutes);
                          setState(() => _panel = 'none');
                        },
                      );
                    }).toList(),
                  ),
                ],
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _chip({
    required String label,
    required bool on,
    required VoidCallback? onTap,
  }) {
    return Material(
      color: on
          ? AppColors.accent.withValues(alpha: 0.12)
          : AppColors.surface.withValues(alpha: 0.7),
      shape: StadiumBorder(
        side: BorderSide(
          color: on
              ? AppColors.accentDeep.withValues(alpha: 0.35)
              : AppColors.line,
        ),
      ),
      child: InkWell(
        customBorder: const StadiumBorder(),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
          child: Text(
            label,
            style: TextStyle(
              fontSize: 12,
              color: on ? AppColors.accentDeep : AppColors.inkSoft,
            ),
          ),
        ),
      ),
    );
  }
}
