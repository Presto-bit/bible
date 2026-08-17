/// 圣经 Tab 全屏目录：对齐 PWA CatalogView（继续条 / 从约翰福音开始 / 卷→章）。
library;

import 'package:flutter/material.dart';

import '../../core/theme.dart';
import '../plans/plan_navigation.dart';
import '../plans/plan_steps.dart';
import 'models.dart';
import 'reader_screen.dart' show bibleBookAbbr;

class ReaderCatalogView extends StatefulWidget {
  const ReaderCatalogView({
    super.key,
    required this.books,
    required this.onPickChapter,
    this.resumeBookId,
    this.resumeChapter,
    this.planSteps,
    this.showBack = false,
    this.onBack,
    this.compact = false,
    this.initialTab = 'books',
  });

  final List<BibleBook> books;
  final void Function(BibleBook book, int chapter) onPickChapter;
  final String? resumeBookId;
  final int? resumeChapter;
  final List<PlanStep>? planSteps;
  final bool showBack;
  final VoidCallback? onBack;

  /// 顶栏卷章弹窗使用：收起「继续阅读」与新手 CTA。
  final bool compact;
  final String initialTab;

  @override
  State<ReaderCatalogView> createState() => _ReaderCatalogViewState();
}

class _ReaderCatalogViewState extends State<ReaderCatalogView> {
  late String _tab; // books | chapters
  late String _selectedBookId;
  String? _warn;

  @override
  void initState() {
    super.initState();
    _tab = widget.initialTab == 'chapters' ? 'chapters' : 'books';
    _selectedBookId =
        widget.resumeBookId ??
        (widget.books.isEmpty ? '' : widget.books.first.id);
  }

  @override
  void didUpdateWidget(covariant ReaderCatalogView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.resumeBookId != null &&
        widget.resumeBookId != oldWidget.resumeBookId) {
      _selectedBookId = widget.resumeBookId!;
    }
  }

  BibleBook? get _selectedBook {
    if (widget.books.isEmpty) return null;
    return widget.books.firstWhere(
      (b) => b.id == _selectedBookId,
      orElse: () => widget.books.first,
    );
  }

  Set<String>? get _planBookIds {
    final steps = widget.planSteps;
    if (steps == null || steps.isEmpty) return null;
    return planBooksInSteps(steps).toSet();
  }

  List<BibleBook> get _visibleBooks {
    final ids = _planBookIds;
    if (ids == null) return widget.books;
    return widget.books.where((b) => ids.contains(b.id)).toList();
  }

  BibleBook? get _resumeBook {
    final id = widget.resumeBookId;
    if (id == null || (widget.planSteps?.isNotEmpty ?? false)) return null;
    for (final b in widget.books) {
      if (b.id == id) return b;
    }
    return null;
  }

  void _tryPick(BibleBook b, int n) {
    final steps = widget.planSteps;
    if (steps != null && steps.isNotEmpty && !isChapterInPlan(steps, b.id, n)) {
      setState(() => _warn = '该章节不在今日计划内，请从计划段列表选择');
      return;
    }
    setState(() => _warn = null);
    widget.onPickChapter(b, n);
  }

  void _pickBook(BibleBook b) {
    final ids = _planBookIds;
    if (ids != null && !ids.contains(b.id)) {
      setState(() => _warn = '该经卷不在今日计划内');
      return;
    }
    setState(() {
      _warn = null;
      _selectedBookId = b.id;
      _tab = 'chapters';
    });
  }

  @override
  Widget build(BuildContext context) {
    final visible = _visibleBooks;
    final ot = visible.where((b) => b.isOldTestament).toList(growable: false);
    final nt = visible.where((b) => !b.isOldTestament).toList(growable: false);
    final selected = _selectedBook;
    final resume = _resumeBook;
    final resumeCh = widget.resumeChapter;
    final inPlan = widget.planSteps?.isNotEmpty ?? false;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (widget.showBack)
          Padding(
            padding: const EdgeInsets.fromLTRB(8, 4, 8, 0),
            child: Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: widget.onBack,
                icon: const Icon(Icons.arrow_back_ios_new, size: 14),
                label: const Text('返回阅读'),
              ),
            ),
          ),
        if (_warn != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: Text(
              _warn!,
              style: const TextStyle(fontSize: 12, color: Color(0xFFB1554A)),
            ),
          ),
        if (!widget.compact &&
            resume != null &&
            resumeCh != null &&
            _tab == 'books')
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
            child: Material(
              color: AppColors.surfaceSunken,
              borderRadius: BorderRadius.circular(14),
              child: InkWell(
                borderRadius: BorderRadius.circular(14),
                onTap: () =>
                    _tryPick(resume, resumeCh.clamp(1, resume.chapterCount)),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(14, 12, 12, 12),
                  child: Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 3,
                        ),
                        decoration: BoxDecoration(
                          color: AppColors.accentDeep,
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: const Text(
                          '继续',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '${resume.name} $resumeCh 章',
                              style: const TextStyle(
                                fontWeight: FontWeight.w700,
                                fontSize: 15,
                              ),
                            ),
                            const Text(
                              '从上次读到的地方继续',
                              style: TextStyle(
                                fontSize: 12,
                                color: AppColors.inkFaint,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const Icon(
                        Icons.chevron_right,
                        color: AppColors.inkFaint,
                      ),
                    ],
                  ),
                ),
              ),
            ),
          )
        else if (!widget.compact && !inPlan && _tab == 'books')
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.accentDeep,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                  onPressed: () {
                    BibleBook? jhn;
                    for (final b in widget.books) {
                      if (b.id == 'JHN') {
                        jhn = b;
                        break;
                      }
                    }
                    if (jhn != null) _tryPick(jhn, 1);
                  },
                  child: const Text(
                    '从约翰福音开始',
                    style: TextStyle(fontWeight: FontWeight.w700),
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  '新手友好 · 也可在下方自由选卷',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 12, color: AppColors.inkFaint),
                ),
              ],
            ),
          ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
          child: Container(
            decoration: BoxDecoration(
              color: AppColors.surfaceSunken,
              borderRadius: BorderRadius.circular(10),
            ),
            padding: const EdgeInsets.all(3),
            child: Row(
              children: [
                Expanded(
                  child: _Seg(
                    label: '卷',
                    active: _tab == 'books',
                    onTap: () => setState(() {
                      _tab = 'books';
                      _warn = null;
                    }),
                  ),
                ),
                Expanded(
                  child: _Seg(
                    label: '章',
                    active: _tab == 'chapters',
                    onTap: () => setState(() {
                      _tab = 'chapters';
                      _warn = null;
                    }),
                  ),
                ),
              ],
            ),
          ),
        ),
        if (_tab == 'chapters' && selected != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: Text(
              '${selected.name} · ${bibleBookAbbr(selected.name)}',
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: AppColors.inkSoft,
              ),
            ),
          ),
        Expanded(
          child: _tab == 'chapters' && selected != null
              ? GridView.builder(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 6,
                    mainAxisSpacing: 8,
                    crossAxisSpacing: 8,
                  ),
                  itemCount: selected.chapterCount,
                  itemBuilder: (_, i) {
                    final n = i + 1;
                    final isResume = resume?.id == selected.id && resumeCh == n;
                    return Material(
                      color: isResume
                          ? AppColors.accentDeep
                          : AppColors.surfaceSunken,
                      borderRadius: BorderRadius.circular(8),
                      child: InkWell(
                        onTap: () => _tryPick(selected, n),
                        borderRadius: BorderRadius.circular(8),
                        child: Center(
                          child: Text(
                            '$n',
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: isResume ? Colors.white : AppColors.ink,
                            ),
                          ),
                        ),
                      ),
                    );
                  },
                )
              : ListView(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                  children: [
                    if (ot.isNotEmpty) ...[
                      const _Label('旧约'),
                      _BookGrid(
                        books: ot,
                        selectedId: _selectedBookId,
                        onPick: _pickBook,
                      ),
                    ],
                    if (nt.isNotEmpty) ...[
                      const SizedBox(height: 14),
                      const _Label('新约'),
                      _BookGrid(
                        books: nt,
                        selectedId: _selectedBookId,
                        onPick: _pickBook,
                      ),
                    ],
                  ],
                ),
        ),
      ],
    );
  }
}

class _Seg extends StatelessWidget {
  const _Seg({required this.label, required this.active, required this.onTap});
  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: active ? AppColors.surface : Colors.transparent,
      borderRadius: BorderRadius.circular(8),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Center(
            child: Text(
              label,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: active ? AppColors.accentDeep : AppColors.inkSoft,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Label extends StatelessWidget {
  const _Label(this.text);
  final String text;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8, top: 2),
      child: Text(
        text,
        style: const TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: AppColors.inkFaint,
        ),
      ),
    );
  }
}

class _BookGrid extends StatelessWidget {
  const _BookGrid({
    required this.books,
    required this.selectedId,
    required this.onPick,
  });
  final List<BibleBook> books;
  final String selectedId;
  final void Function(BibleBook) onPick;

  @override
  Widget build(BuildContext context) {
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: books.length,
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 4,
        mainAxisSpacing: 8,
        crossAxisSpacing: 8,
        childAspectRatio: 0.92,
      ),
      itemBuilder: (_, i) {
        final b = books[i];
        final active = b.id == selectedId;
        return Material(
          color: active ? AppColors.goldWash : AppColors.surfaceSunken,
          borderRadius: BorderRadius.circular(12),
          child: InkWell(
            onTap: () => onPick(b),
            borderRadius: BorderRadius.circular(12),
            child: Padding(
              padding: const EdgeInsets.all(8),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    bibleBookAbbr(b.name),
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                      color: active ? AppColors.accentDeep : AppColors.ink,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    b.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 10,
                      color: AppColors.inkFaint,
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
