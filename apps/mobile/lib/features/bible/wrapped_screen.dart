/// 故事回顾：全屏竖滑分页（对齐 PWA WrappedStory；原生 PageView，不走 WebView）。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/daily_verse_wallpaper.dart';
import '../../core/database/app_database.dart' show Note, Bookmark;
import '../../core/home_day_wallpaper_cache.dart';
import '../../core/mark_ref.dart';
import '../../core/theme.dart';
import '../notes/notes_repository.dart';
import 'bible_repository.dart';
import 'markings_repository.dart';
import 'reader_marking_models.dart';
import 'reading_repository.dart';
import 'wrapped.dart';

final wrappedStatsProvider = FutureProvider.family<WrappedStats, String>((
  ref,
  period,
) async {
  final review = await ref.read(reviewDataProvider.future);
  final bible = ref.read(bibleRepoProvider);

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

  final colorByRef = <String, String>{
    for (final e in highlights.entries) e.key: e.value.color,
  };

  final base = buildWrapped(
    review: review,
    period: period,
    notesCount: noteCount,
    favoritesCount: bookmarks.length,
    marksCount: highlights.length,
    highlightColors: colorByRef,
  );

  Future<String?> fetchVerseText(String refKey) async {
    final p = parseMarkRef(refKey);
    if (p == null || p.verseStart == null) return null;
    try {
      final ch = await bible.chapter(p.bookId, p.chapter);
      for (final v in ch.verses) {
        if (v.verse == p.verseStart) {
          final text = v.text.trim();
          return text.isEmpty ? null : text;
        }
      }
    } catch (_) {}
    return null;
  }

  return enrichWrappedTexts(base, fetchVerseText);
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

  void _switchPeriod(String period) {
    if (_period == period) return;
    setState(() {
      _period = period;
      _index = 0;
    });
    if (_page.hasClients) _page.jumpToPage(0);
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
          final slides = s.slides;
          return Stack(
            children: [
              PageView.builder(
                controller: _page,
                scrollDirection: Axis.vertical,
                physics: const PageScrollPhysics(
                  parent: ClampingScrollPhysics(),
                ),
                allowImplicitScrolling: true,
                itemCount: slides.length,
                onPageChanged: (i) => setState(() => _index = i),
                itemBuilder: (context, i) => _SlideView(
                  slide: slides[i],
                  period: s.period,
                  isLast: i == slides.length - 1,
                  onShare: () => SharePlus.instance.share(
                    ShareParams(text: wrappedShareText(s)),
                  ),
                  onNext: i < slides.length - 1
                      ? () => _page.animateToPage(
                            i + 1,
                            duration: const Duration(milliseconds: 320),
                            curve: Curves.easeOutCubic,
                          )
                      : null,
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
      onTap: () => _switchPeriod(period),
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
  const _SlideView({
    required this.slide,
    required this.period,
    required this.isLast,
    required this.onShare,
    this.onNext,
  });

  final WrappedSlide slide;
  final String period;
  final bool isLast;
  final VoidCallback onShare;
  final VoidCallback? onNext;

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
              ..._slideBody(),
              const Spacer(),
              if (isLast) ...[
                FilledButton(
                  onPressed: onShare,
                  style: FilledButton.styleFrom(
                    backgroundColor: Colors.white,
                    foregroundColor: AppColors.ink,
                    minimumSize: const Size.fromHeight(48),
                  ),
                  child: const Text('分享海报'),
                ),
                const SizedBox(height: 8),
                Text(
                  '一图含经文与足迹 · 可发朋友圈',
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.55),
                    fontSize: 12,
                  ),
                ),
              ] else if (onNext != null)
                TextButton(
                  onPressed: onNext,
                  style: TextButton.styleFrom(foregroundColor: Colors.white70),
                  child: const Text('继续'),
                ),
            ],
          ),
        ),
      ],
    );
  }

  List<Widget> _slideBody() {
    if (slide.kind == WrappedSlideKind.verse) {
      return [
        Text(
          slide.title,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 28,
            height: 1.35,
            fontWeight: FontWeight.w700,
          ),
        ),
        if (slide.body != null) ...[
          const SizedBox(height: 12),
          Text(
            slide.body!,
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.75),
              fontSize: 14,
              height: 1.5,
              fontStyle: FontStyle.italic,
            ),
          ),
        ],
      ];
    }

    if (slide.kind == WrappedSlideKind.quotes && slide.quotes != null) {
      return [
        Text(
          slide.title,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 28,
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
              fontSize: 15,
              height: 1.55,
            ),
          ),
        ],
        const SizedBox(height: 20),
        for (final q in slide.quotes!)
          Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  q.text != null && q.text!.isNotEmpty
                      ? '「${q.text}」'
                      : q.label,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 16,
                    height: 1.55,
                  ),
                ),
                if (q.text != null && q.text!.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(
                    q.label,
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.6),
                      fontSize: 12,
                    ),
                  ),
                ],
              ],
            ),
          ),
      ];
    }

    return [
      Text(
        slide.title,
        style: TextStyle(
          color: Colors.white,
          fontSize: slide.kind == WrappedSlideKind.cover ? 28 : 32,
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
    ];
  }
}
