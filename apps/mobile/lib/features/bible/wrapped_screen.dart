/// 月/年度 Wrapped 回顾页。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/theme.dart';
import '../../core/widgets/paper_card.dart';
import '../notes/notes_repository.dart';
import 'markings_repository.dart';
import 'reading_repository.dart';
import 'wrapped.dart';

final wrappedStatsProvider =
    FutureProvider.family<WrappedStats, String>((ref, period) async {
  final review = await ref.watch(reviewDataProvider.future);
  final notes = await ref.watch(notesStreamProvider.future);
  final bookmarks = await ref.watch(bookmarksProvider.future);
  final highlights = await ref.watch(highlightMapProvider.future);
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
      appBar: AppBar(
        title: const Text('读经回顾'),
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
        error: (e, _) => Center(child: Text('$e')),
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
      onSelected: (_) => setState(() => _period = period),
      selectedColor: AppColors.accentWash,
    );
  }

  Widget _statGrid(WrappedStats s) {
    final tiles = [
      ('活跃天数', '${s.activeDays}'),
      ('读经分钟', '${s.totalMinutes}'),
      ('读过章数', '${s.chapters}'),
      ('连续打卡', '${s.streak}'),
      ('笔记', '${s.notesCount}'),
      ('收藏', '${s.favoritesCount}'),
      ('划线', '${s.marksCount}'),
    ];
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 10,
      crossAxisSpacing: 10,
      childAspectRatio: 1.6,
      children: tiles
          .map((t) => PaperCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(t.$1,
                        style: const TextStyle(
                            fontSize: 12, color: AppColors.inkFaint)),
                    const SizedBox(height: 4),
                    Text(t.$2,
                        style: AppTypography.stat.copyWith(fontSize: 22)),
                  ],
                ),
              ))
          .toList(),
    );
  }
}
