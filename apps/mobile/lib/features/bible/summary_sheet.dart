/// 经卷/章节概要半屏：对齐 PWA SummarySheet（双 Tab + 小爱导读 + 本章背景）。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/theme.dart';
import 'bible_summary.dart';
import 'content_repository.dart';

Future<void> showBibleSummarySheet(
  BuildContext context,
  WidgetRef ref, {
  required String bookId,
  required String bookName,
  required int chapter,
  String initialTab = 'chapter', // chapter | book
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppColors.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (ctx) => _SummarySheetBody(
      bookId: bookId,
      bookName: bookName,
      chapter: chapter,
      initialTab: initialTab,
    ),
  );
}

class _SummarySheetBody extends ConsumerStatefulWidget {
  const _SummarySheetBody({
    required this.bookId,
    required this.bookName,
    required this.chapter,
    required this.initialTab,
  });
  final String bookId;
  final String bookName;
  final int chapter;
  final String initialTab;

  @override
  ConsumerState<_SummarySheetBody> createState() => _SummarySheetBodyState();
}

class _SummarySheetBodyState extends ConsumerState<_SummarySheetBody> {
  late String _tab;
  late Future<String> _chapterFuture;
  late Future<String> _bookFuture;
  TimelineChapterRow? _timeline;
  List<GeoPlace> _places = const [];
  var _ctxLoaded = false;

  @override
  void initState() {
    super.initState();
    _tab = widget.initialTab == 'book' ? 'book' : 'chapter';
    _chapterFuture = _loadChapter();
    _bookFuture = _loadBook();
    _loadContext();
  }

  Future<String> _loadChapter() => loadChapterSummary(
        ref,
        ref.read(prefsProvider),
        widget.bookId,
        widget.bookName,
        widget.chapter,
      );

  Future<String> _loadBook() => loadBookSummary(
        ref,
        ref.read(prefsProvider),
        widget.bookId,
        widget.bookName,
      );

  Future<void> _loadContext() async {
    final repo = ref.read(contentRepoProvider);
    final results = await Future.wait([
      repo.timelineForChapter(widget.bookId, widget.chapter),
      repo.geographyForChapter(widget.bookId, widget.chapter),
    ]);
    if (!mounted) return;
    setState(() {
      _timeline = results[0] as TimelineChapterRow?;
      _places = results[1] as List<GeoPlace>;
      _ctxLoaded = true;
    });
  }

  @override
  Widget build(BuildContext context) {
    final h = MediaQuery.sizeOf(context).height;
    final bottom = MediaQuery.viewInsetsOf(context).bottom;
    final activeFuture = _tab == 'chapter' ? _chapterFuture : _bookFuture;
    final era = _timeline?.eraLabel;
    final showContext = _tab == 'chapter' &&
        _ctxLoaded &&
        ((era != null && era.isNotEmpty) || _places.isNotEmpty);

    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(20, 8, 12, 16 + bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 36,
                height: 4,
                margin: const EdgeInsets.only(bottom: 10),
                decoration: BoxDecoration(
                  color: AppColors.line,
                  borderRadius: BorderRadius.circular(4),
                ),
              ),
            ),
            Row(
              children: [
                Expanded(
                  child: Text(
                    widget.bookName,
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 17,
                      color: AppColors.ink,
                    ),
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close, color: AppColors.inkFaint),
                  onPressed: () => Navigator.pop(context),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Row(
              children: [
                _tabBtn(
                  label: '第 ${widget.chapter} 章',
                  active: _tab == 'chapter',
                  onTap: () => setState(() => _tab = 'chapter'),
                ),
                const SizedBox(width: 8),
                _tabBtn(
                  label: '整卷概览',
                  active: _tab == 'book',
                  onTap: () => setState(() => _tab = 'book'),
                ),
                const Spacer(),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: AppColors.accentWash,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: const Text(
                    '小爱导读',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: AppColors.accentDeep,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            ConstrainedBox(
              constraints: BoxConstraints(maxHeight: h * 0.55),
              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    FutureBuilder<String>(
                      future: activeFuture,
                      builder: (ctx, snap) {
                        if (snap.connectionState != ConnectionState.done) {
                          return const Padding(
                            padding: EdgeInsets.symmetric(vertical: 28),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                CircularProgressIndicator(strokeWidth: 2),
                                SizedBox(height: 12),
                                Text('小爱正在整理…',
                                    style: TextStyle(
                                        color: AppColors.inkFaint,
                                        fontSize: 13)),
                              ],
                            ),
                          );
                        }
                        if (snap.hasError) {
                          return Column(
                            mainAxisSize: MainAxisSize.min,
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('加载失败：${snap.error}',
                                  style: const TextStyle(
                                      color: Color(0xFFB1554A), fontSize: 14)),
                              const SizedBox(height: 10),
                              TextButton(
                                onPressed: () {
                                  setState(() {
                                    if (_tab == 'chapter') {
                                      _chapterFuture = _loadChapter();
                                    } else {
                                      _bookFuture = _loadBook();
                                    }
                                  });
                                },
                                child: const Text('重试'),
                              ),
                            ],
                          );
                        }
                        final body = (snap.data ?? '').trim();
                        if (body.isEmpty) {
                          return const Text(
                            '暂无概要内容，请稍后重试或换一章。',
                            style: TextStyle(
                                color: AppColors.inkFaint, fontSize: 14),
                          );
                        }
                        return Text(
                          body,
                          style: const TextStyle(
                            fontSize: 15,
                            height: 1.75,
                            color: AppColors.inkSoft,
                          ),
                        );
                      },
                    ),
                    if (showContext) ...[
                      const SizedBox(height: 18),
                      const Text(
                        '本章背景',
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: AppColors.ink,
                        ),
                      ),
                      if (era != null && era.isNotEmpty) ...[
                        const SizedBox(height: 8),
                        Text(
                          '🕐 $era',
                          style: const TextStyle(
                            fontSize: 13,
                            color: AppColors.inkSoft,
                          ),
                        ),
                      ],
                      if (_places.isNotEmpty) ...[
                        const SizedBox(height: 10),
                        Wrap(
                          spacing: 6,
                          runSpacing: 6,
                          children: [
                            for (final p in _places.take(8))
                              Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 10, vertical: 5),
                                decoration: BoxDecoration(
                                  color: AppColors.surfaceSunken,
                                  borderRadius: BorderRadius.circular(999),
                                  border: Border.all(color: AppColors.line),
                                ),
                                child: Text(
                                  p.name,
                                  style: const TextStyle(
                                    fontSize: 12,
                                    color: AppColors.inkSoft,
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ],
                    ],
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _tabBtn({
    required String label,
    required bool active,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(
          color: active ? AppColors.accentWash : AppColors.surfaceSunken,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(
            color: active ? AppColors.accent : Colors.transparent,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 13,
            fontWeight: active ? FontWeight.w700 : FontWeight.w500,
            color: active ? AppColors.accentDeep : AppColors.inkSoft,
          ),
        ),
      ),
    );
  }
}
