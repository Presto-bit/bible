/// 月/年度 Wrapped 回顾页。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/database/app_database.dart' show Note, Bookmark;
import '../../core/theme.dart';
import '../../core/widgets/paper_card.dart';
import '../notes/notes_repository.dart';
import 'markings_repository.dart';
import 'reader_marking_models.dart';
import 'reading_repository.dart';
import 'wrapped.dart';

final wrappedStatsProvider =
    FutureProvider.family<WrappedStats, String>((ref, period) async {
  final review = await ref.read(reviewDataProvider.future);

  // 先拿当前缓存；再等短暂
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
      .where((n) =>
          n.updatedAtMs >= range.start && n.updatedAtMs < range.end)
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

class WrappedScreen extends ConsumerStatefulWidget {
  const WrappedScreen({super.key, this.initialPeriod = 'month'});
  final String initialPeriod;

  @override
  ConsumerState<WrappedScreen> createState() => _WrappedScreenState();
}

class _WrappedScreenState extends ConsumerState<WrappedScreen> {
  late String _period;

  @override
  void initState() {
    super.initState();
    _period = widget.initialPeriod == 'year' ? 'year' : 'month';
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(wrappedStatsProvider(_period));
    return Scaffold(
      backgroundColor: AppColors.paper,
      appBar: AppBar(
        title: const Text('故事回顾'),
        actions: [
          async.maybeWhen(
            data: (s) => IconButton(
              icon: const Icon(Icons.ios_share),
              onPressed: () => Share.share(wrappedShareText(s)),
            ),
            orElse: () => const SizedBox.shrink(),
          ),
        ],
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('$e', textAlign: TextAlign.center),
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
        data: (s) => ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
          children: [
            Row(
              children: [
                _periodChip('本月', 'month'),
                const SizedBox(width: 8),
                _periodChip('今年', 'year'),
              ],
            ),
            const SizedBox(height: 16),
            PaperCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(s.label,
                      style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w700,
                          color: AppColors.ink)),
                  const SizedBox(height: 8),
                  Text(s.highlight,
                      style: const TextStyle(
                          fontSize: 15, height: 1.5, color: AppColors.inkSoft)),
                ],
              ),
            ),
            const SizedBox(height: 12),
            _statGrid(s),
          ],
        ),
      ),
    );
  }

  Widget _periodChip(String label, String period) {
    final active = _period == period;
    return ChoiceChip(
      label: Text(label),
      selected: active,
      selectedColor: AppColors.accentWash,
      onSelected: (_) => setState(() => _period = period),
    );
  }

  Widget _statGrid(WrappedStats s) {
    final items = <(String, String)>[
      ('阅读时长', '${s.totalMinutes} 分'),
      ('活跃天数', '${s.activeDays}'),
      ('连续打卡', '${s.streak}'),
      ('章节', '${s.chapters}'),
      ('笔记', '${s.notesCount}'),
      ('收藏', '${s.favoritesCount}'),
      ('划线', '${s.marksCount}'),
    ];
    return Wrap(
      spacing: 10,
      runSpacing: 10,
      children: items
          .map(
            (e) => SizedBox(
              width: (MediaQuery.of(context).size.width - 16 * 2 - 10) / 2,
              child: PaperCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(e.$1,
                        style: const TextStyle(
                            fontSize: 12, color: AppColors.inkFaint)),
                    const SizedBox(height: 6),
                    Text(e.$2,
                        style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w700,
                            color: AppColors.ink)),
                  ],
                ),
              ),
            ),
          )
          .toList(),
    );
  }
}
