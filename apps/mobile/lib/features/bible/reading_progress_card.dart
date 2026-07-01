/// 读经进度卡片：概览 + 目录弹窗（与圣经 TAB 目录样式一致）。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/app_shell.dart' show navIndexProvider;
import '../../core/theme.dart';
import 'bible_repository.dart';
import 'models.dart';
import 'reader_screen.dart' show bibleBookAbbr, readerJumpProvider;
import 'reading_repository.dart';

enum _BookState { done, reading, todo }

_BookState _stateOf(BookProgress? p) {
  if (p == null || (p.passes == 0 && p.distinctChapters == 0)) {
    return _BookState.todo;
  }
  if (p.passes >= 1) return _BookState.done;
  if (p.distinctChapters > 0) return _BookState.reading;
  return _BookState.todo;
}

class ReadingProgressCard extends ConsumerWidget {
  const ReadingProgressCard({super.key});

  void _openCatalog(
    BuildContext context,
    WidgetRef ref,
    List<BibleBook> books,
    Map<String, BookProgress> progress,
    ReviewData data,
  ) {
    void go(BibleBook b) {
      final last = data.lastChapterOf(b.id) ?? 1;
      ref.read(readerJumpProvider.notifier).jump(b.id, last < 1 ? 1 : last);
      ref.read(navIndexProvider.notifier).set(1);
      Navigator.of(context).maybePop();
    }

    final ot = books.where((b) => b.isOldTestament).toList();
    final nt = books.where((b) => !b.isOldTestament).toList();

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.paper,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.7,
        maxChildSize: 0.92,
        builder: (_, controller) => ListView(
          controller: controller,
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 24),
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: AppColors.line,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 12),
            const Center(
              child: Text('读经目录',
                  style:
                      TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
            ),
            const SizedBox(height: 12),
            if (ot.isNotEmpty) _CatalogSection(title: '旧约', books: ot, progress: progress, onTap: go),
            if (nt.isNotEmpty) _CatalogSection(title: '新约', books: nt, progress: progress, onTap: go),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final books = ref.watch(booksProvider).value ?? const <BibleBook>[];
    final reviewAsync = ref.watch(reviewDataProvider);

    return reviewAsync.when(
      loading: () => const SizedBox.shrink(),
      error: (_, _) => const SizedBox.shrink(),
      data: (data) {
        final totals = {for (final b in books) b.id: b.chapterCount};
        final allTime = data.bookProgress(totals);
        final totalBooks = books.length;
        final readBooks = allTime.values
            .where((p) => p.distinctChapters > 0 || p.passes >= 1)
            .length;
        final overall =
            totalBooks > 0 ? (readBooks / totalBooks * 100).round() : 0;

        return GestureDetector(
          onTap: books.isEmpty
              ? null
              : () => _openCatalog(context, ref, books, allTime, data),
          child: Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.line),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: const [
                    Text('读经旅程',
                        style: TextStyle(
                            fontWeight: FontWeight.w700, fontSize: 14)),
                    Spacer(),
                    Text('目录 ›',
                        style:
                            TextStyle(color: AppColors.inkFaint, fontSize: 12)),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    _Ring(pct: overall),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('已读 $readBooks / $totalBooks 卷',
                              style:
                                  const TextStyle(fontWeight: FontWeight.w600)),
                          const SizedBox(height: 4),
                          const Text('点击查看目录与进度',
                              style: TextStyle(
                                  fontSize: 12, color: AppColors.inkFaint)),
                        ],
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _CatalogSection extends StatelessWidget {
  const _CatalogSection({
    required this.title,
    required this.books,
    required this.progress,
    required this.onTap,
  });

  final String title;
  final List<BibleBook> books;
  final Map<String, BookProgress> progress;
  final void Function(BibleBook book) onTap;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Text(title,
              style: const TextStyle(
                  color: AppColors.ink,
                  fontSize: 13,
                  fontWeight: FontWeight.w600)),
        ),
        GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 3,
            mainAxisSpacing: 8,
            crossAxisSpacing: 8,
            childAspectRatio: 1.55,
          ),
          itemCount: books.length,
          itemBuilder: (_, i) {
            final b = books[i];
            final p = progress[b.id];
            final st = _stateOf(p);
            final pct = st == _BookState.done
                ? 100
                : (b.chapterCount > 0
                    ? ((p?.distinctChapters ?? 0) / b.chapterCount * 100).round()
                    : 0);
            return GestureDetector(
              onTap: () => onTap(b),
              child: Container(
                decoration: BoxDecoration(
                  color: st == _BookState.done
                      ? AppColors.accentWash
                      : AppColors.surface,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                    color: st == _BookState.todo
                        ? AppColors.line
                        : AppColors.accentDeep,
                    width: st == _BookState.todo ? 1 : 1.5,
                  ),
                ),
                child: Stack(
                  children: [
                    if (st != _BookState.todo)
                      Positioned(
                        top: 6,
                        right: 6,
                        child: Container(
                          width: 7,
                          height: 7,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: st == _BookState.done
                                ? AppColors.accentDeep
                                : AppColors.accent,
                          ),
                        ),
                      ),
                    Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(bibleBookAbbr(b.name),
                            style: const TextStyle(
                                fontSize: 20,
                                fontWeight: FontWeight.w700,
                                height: 1.2,
                                color: AppColors.ink)),
                        const SizedBox(height: 2),
                        Text(b.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                                fontSize: 10, color: AppColors.inkSoft)),
                        const SizedBox(height: 1),
                        Text(
                            st == _BookState.done
                                ? '✓ 通读'
                                : st == _BookState.reading
                                    ? '$pct%'
                                    : '${b.chapterCount} 章',
                            style: const TextStyle(
                                fontSize: 9, color: AppColors.inkFaint)),
                      ],
                    ),
                  ],
                ),
              ),
            );
          },
        ),
        const SizedBox(height: 8),
      ],
    );
  }
}

class _Ring extends StatelessWidget {
  const _Ring({required this.pct});
  final int pct;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 60,
      height: 60,
      child: Stack(
        alignment: Alignment.center,
        children: [
          SizedBox(
            width: 60,
            height: 60,
            child: CircularProgressIndicator(
              value: pct / 100,
              strokeWidth: 6,
              backgroundColor: AppColors.accentWash,
              valueColor: const AlwaysStoppedAnimation(AppColors.accentDeep),
            ),
          ),
          Text('$pct%',
              style: const TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 13,
                  color: AppColors.accentDeep)),
        ],
      ),
    );
  }
}
