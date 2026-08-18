/// 故事回顾：全屏竖滑分页（对齐 PWA WrappedStory；不走 WebView snap）。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/daily_verse_wallpaper.dart';
import '../../core/database/app_database.dart' show Note, Bookmark;
import '../../core/home_day_wallpaper_cache.dart';
import '../../core/theme.dart';
import '../notes/notes_repository.dart';
import 'markings_repository.dart';
import 'reader_marking_models.dart';
import 'reading_repository.dart';
import 'wrapped.dart';

final wrappedStatsProvider = FutureProvider.family<WrappedStats, String>((
  ref,
  period,
) async {
  final review = await ref.read(reviewDataProvider.future);

  var notes = ref.read(notesStreamProvider).value ?? const <Note>[];
  var bookmarks = ref.read(bookmarksProvider).value ?? const <Bookmark>[];
  var highlights =
      ref.read(highlightMapProvider).value ?? const <String, HighlightMark>{};

  try {
    notes = await ref
        .watch(notesStreamProvider.future)
        .timeout(const Duration(seconds: 2), onTimeout: () => notes);
  } catch (_) {}
  try {
    bookmarks = await ref
        .watch(bookmarksProvider.future)
        .timeout(const Duration(seconds: 2), onTimeout: () => bookmarks);
  } catch (_) {}
  try {
    highlights = await ref
        .watch(highlightMapProvider.future)
        .timeout(const Duration(seconds: 2), onTimeout: () => highlights);
  } catch (_) {}

  final range = _periodRange(period);
  final noteCount = notes
      .where((n) => n.updatedAtMs >= range.start && n.updatedAtMs < range.end)
      .length;
  return buildWrapped(
    review: review,
    period: period,
    notesCount: noteCount,
    favoritesCount: bookmarks.length,
    marksCount: highlights.length,
  );
});

({int start, int end}) _periodRange(String period) {
  final now = DateTime.now();
  if (period == 'year') {
    return (
      start: DateTime(now.year, 1, 1).millisecondsSinceEpoch,
      end: DateTime(now.year + 1, 1, 1).millisecondsSinceEpoch,
    );
  }
  return (
    start: DateTime(now.year, now.month, 1).millisecondsSinceEpoch,
    end: DateTime(now.year, now.month + 1, 1).millisecondsSinceEpoch,
  );
}

class _StorySlide {
  const _StorySlide({
    required this.kicker,
    required this.title,
    this.body,
    this.metrics = const [],
    required this.wallpaperDay,
    this.share = false,
  });
  final String kicker;
  final String title;
  final String? body;
  final List<(String value, String label)> metrics;
  final int wallpaperDay;
  final bool share;
}

List<_StorySlide> _slidesFor(WrappedStats s) {
  return [
    _StorySlide(
      kicker: '故事回顾',
      title: s.label,
      body: s.highlight,
      wallpaperDay: s.period == 'year' ? 12 : 3,
    ),
    _StorySlide(
      kicker: '时间',
      title: '${s.totalMinutes} 分钟',
      body: '你把这段时间给了话语',
      metrics: [('${s.totalMinutes}', '分钟')],
      wallpaperDay: 7,
    ),
    _StorySlide(
      kicker: '节奏',
      title: s.streak > 0 ? '连续 ${s.streak} 天' : '活跃 ${s.activeDays} 天',
      body: s.streak > 0 ? '你在话语里留下了连续的足迹' : '每一个打开的日子都算数',
      metrics: [('${s.activeDays}', '活跃天'), ('${s.streak}', '连续')],
      wallpaperDay: 18,
    ),
    _StorySlide(
      kicker: '经文',
      title: '读了 ${s.chapters} 章',
      body: '章章都是相遇',
      metrics: [('${s.chapters}', '章')],
      wallpaperDay: 15,
    ),
    _StorySlide(
      kicker: '留下的',
      title: s.marksCount > 0 ? '划线 ${s.marksCount} 处' : '慢慢记下',
      body: '笔记、收藏与划线，都是你与话语的痕迹',
      metrics: [
        ('${s.notesCount}', '笔记'),
        ('${s.favoritesCount}', '收藏'),
        ('${s.marksCount}', '划线'),
      ],
      wallpaperDay: 22,
    ),
    _StorySlide(
      kicker: '彼爱',
      title: '愿你继续在话语中相遇',
      body: s.highlight,
      wallpaperDay: 28,
      share: true,
    ),
  ];
}

class WrappedScreen extends ConsumerStatefulWidget {
  const WrappedScreen({super.key, this.initialPeriod = 'month'});
  final String initialPeriod;

  @override
  ConsumerState<WrappedScreen> createState() => _WrappedScreenState();
}

class _WrappedScreenState extends ConsumerState<WrappedScreen> {
  late String _period;
  final _page = PageController();
  var _index = 0;

  @override
  void initState() {
    super.initState();
    _period = widget.initialPeriod == 'year' ? 'year' : 'month';
  }

  @override
  void dispose() {
    _page.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(wrappedStatsProvider(_period));
    return Scaffold(
      backgroundColor: const Color(0xFF1A1814),
      body: async.when(
        loading: () => const Center(
          child: CircularProgressIndicator(color: Colors.white70),
        ),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  '$e',
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.white70),
                ),
                const SizedBox(height: 12),
                FilledButton(
                  onPressed: () =>
                      ref.invalidate(wrappedStatsProvider(_period)),
                  child: const Text('重试'),
                ),
              ],
            ),
          ),
        ),
        data: (s) {
          final slides = _slidesFor(s);
          return Stack(
            children: [
              PageView.builder(
                controller: _page,
                scrollDirection: Axis.vertical,
                physics: const PageScrollPhysics(
                  parent: ClampingScrollPhysics(),
                ),
                itemCount: slides.length,
                onPageChanged: (i) => setState(() => _index = i),
                itemBuilder: (context, i) => _SlideView(
                  slide: slides[i],
                  onShare: () => SharePlus.instance.share(
                    ShareParams(text: wrappedShareText(s)),
                  ),
                ),
              ),
              SafeArea(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(8, 4, 12, 0),
                  child: Row(
                    children: [
                      IconButton(
                        onPressed: () => Navigator.of(context).maybePop(),
                        icon: const Icon(Icons.close, color: Colors.white),
                      ),
                      const Spacer(),
                      _periodChip('本月', 'month'),
                      const SizedBox(width: 8),
                      _periodChip('今年', 'year'),
                    ],
                  ),
                ),
              ),
              Positioned(
                left: 20,
                right: 20,
                top: MediaQuery.paddingOf(context).top + 52,
                child: Row(
                  children: [
                    for (var i = 0; i < slides.length; i++)
                      Expanded(
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 2),
                          child: DecoratedBox(
                            decoration: BoxDecoration(
                              color: i <= _index
                                  ? Colors.white
                                  : Colors.white24,
                              borderRadius: BorderRadius.circular(99),
                            ),
                            child: const SizedBox(height: 3),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              if (_index < slides.length - 1)
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: MediaQuery.paddingOf(context).bottom + 18,
                  child: const IgnorePointer(
                    child: Text(
                      '下滑继续',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: Colors.white70,
                        fontSize: 13,
                        letterSpacing: 0.4,
                      ),
                    ),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }

  Widget _periodChip(String label, String period) {
    final active = _period == period;
    return GestureDetector(
      onTap: () {
        if (_period == period) return;
        setState(() {
          _period = period;
          _index = 0;
        });
        _page.jumpToPage(0);
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: active ? Colors.white : Colors.white24,
          borderRadius: BorderRadius.circular(999),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: active ? AppColors.ink : Colors.white,
          ),
        ),
      ),
    );
  }
}

class _SlideView extends StatelessWidget {
  const _SlideView({required this.slide, required this.onShare});
  final _StorySlide slide;
  final VoidCallback onShare;

  @override
  Widget build(BuildContext context) {
    final pad = MediaQuery.paddingOf(context);
    return Stack(
      fit: StackFit.expand,
      children: [
        HomeDayNetworkImage(
          url: dailyVerseWallpaperUrl(slide.wallpaperDay),
          fit: BoxFit.cover,
          errorBuilder: (_, _, _) => const ColoredBox(color: Color(0xFF1A1814)),
        ),
        const DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Color(0x66000000), Color(0xCC000000)],
            ),
          ),
        ),
        Padding(
          padding: EdgeInsets.fromLTRB(24, pad.top + 88, 24, pad.bottom + 56),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                slide.kicker,
                style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.72),
                  fontSize: 13,
                  letterSpacing: 1.2,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 14),
              Text(
                slide.title,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 32,
                  height: 1.25,
                  fontWeight: FontWeight.w700,
                ),
              ),
              if (slide.body != null) ...[
                const SizedBox(height: 12),
                Text(
                  slide.body!,
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.88),
                    fontSize: 16,
                    height: 1.55,
                  ),
                ),
              ],
              if (slide.metrics.isNotEmpty) ...[
                const SizedBox(height: 28),
                Wrap(
                  spacing: 18,
                  runSpacing: 12,
                  children: [
                    for (final m in slide.metrics)
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            m.$1,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 28,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          Text(
                            m.$2,
                            style: TextStyle(
                              color: Colors.white.withValues(alpha: 0.65),
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
                  ],
                ),
              ],
              const Spacer(),
              if (slide.share)
                FilledButton(
                  onPressed: onShare,
                  style: FilledButton.styleFrom(
                    backgroundColor: Colors.white,
                    foregroundColor: AppColors.ink,
                  ),
                  child: const Text('分享这一段'),
                ),
            ],
          ),
        ),
      ],
    );
  }
}
