/// 经卷 · 章节选择：对齐 PWA ReaderLocPopover（锚点弹层 + 卷/章 Tab）。
library;

import 'package:flutter/material.dart';

import '../../core/theme.dart';
import '../plans/plan_navigation.dart';
import '../plans/plan_steps.dart';
import 'models.dart';
import 'reader_screen.dart' show bibleBookAbbr;

Future<({BibleBook book, int chapter})?> showReaderLocPopover(
  BuildContext context, {
  required GlobalKey anchorKey,
  required List<BibleBook> books,
  required BibleBook currentBook,
  required int currentChapter,
  List<PlanStep>? planSteps,
}) async {
  final box = anchorKey.currentContext?.findRenderObject() as RenderBox?;
  if (box == null || !box.hasSize) return null;
  final offset = box.localToGlobal(Offset.zero);
  final size = box.size;
  final media = MediaQuery.of(context);
  final maxW = (media.size.width - 16).clamp(240.0, 340.0);
  var left = offset.dx;
  if (left + maxW > media.size.width - 8) {
    left = media.size.width - 8 - maxW;
  }
  left = left.clamp(8.0, media.size.width - maxW - 8);

  return showGeneralDialog<({BibleBook book, int chapter})>(
    context: context,
    barrierLabel: '选择经卷与章节',
    barrierDismissible: true,
    barrierColor: Colors.black.withValues(alpha: 0.18),
    transitionDuration: const Duration(milliseconds: 160),
    pageBuilder: (ctx, anim, _) {
      return Stack(
        children: [
          Positioned(
            top: offset.dy + size.height + 6,
            left: left,
            width: maxW,
            child: Material(
              color: Colors.transparent,
              child: FadeTransition(
                opacity: anim,
                child: _ReaderLocPanel(
                  books: books,
                  currentBook: currentBook,
                  currentChapter: currentChapter,
                  planSteps: planSteps,
                  onPick: (b, ch) => Navigator.pop(ctx, (book: b, chapter: ch)),
                  onClose: () => Navigator.pop(ctx),
                ),
              ),
            ),
          ),
        ],
      );
    },
  );
}

class _ReaderLocPanel extends StatefulWidget {
  const _ReaderLocPanel({
    required this.books,
    required this.currentBook,
    required this.currentChapter,
    this.planSteps,
    required this.onPick,
    required this.onClose,
  });

  final List<BibleBook> books;
  final BibleBook currentBook;
  final int currentChapter;
  final List<PlanStep>? planSteps;
  final void Function(BibleBook book, int chapter) onPick;
  final VoidCallback onClose;

  @override
  State<_ReaderLocPanel> createState() => _ReaderLocPanelState();
}

class _ReaderLocPanelState extends State<_ReaderLocPanel> {
  late String _tab; // books | chapters
  late String _selectedBookId;
  String? _warn;

  @override
  void initState() {
    super.initState();
    _tab = 'chapters';
    _selectedBookId = widget.currentBook.id;
  }

  BibleBook get _selectedBook =>
      widget.books.firstWhere(
        (b) => b.id == _selectedBookId,
        orElse: () => widget.currentBook,
      );

  Set<String>? get _planBookIds {
    final steps = widget.planSteps;
    if (steps == null || steps.isEmpty) return null;
    return planBooksInSteps(steps).toSet();
  }

  Set<int>? get _allowedChapters {
    final steps = widget.planSteps;
    if (steps == null || steps.isEmpty) return null;
    return allowedChaptersForBook(steps, _selectedBook.id).toSet();
  }

  List<BibleBook> get _visibleBooks {
    final ids = _planBookIds;
    if (ids == null) return widget.books;
    return widget.books.where((b) => ids.contains(b.id)).toList();
  }

  void _tryPickChapter(int n) {
    final steps = widget.planSteps;
    if (steps != null &&
        steps.isNotEmpty &&
        !isChapterInPlan(steps, _selectedBook.id, n)) {
      setState(() => _warn = '该章节不在今日计划内');
      return;
    }
    widget.onPick(_selectedBook, n);
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
    final ot =
        visible.where((b) => b.isOldTestament).toList(growable: false);
    final nt =
        visible.where((b) => !b.isOldTestament).toList(growable: false);
    final allowed = _allowedChapters;
    final mediaH = MediaQuery.sizeOf(context).height;
    final maxH = mediaH * 0.52;

    return Container(
      constraints: BoxConstraints(maxHeight: maxH),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.line),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.14),
            blurRadius: 24,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 8, 4),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _selectedBook.name,
                        style: const TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 15,
                        ),
                      ),
                      Text(
                        _tab == 'chapters'
                            ? (_selectedBook.id == widget.currentBook.id
                                ? '第 ${widget.currentChapter} 章'
                                : '选章')
                            : '选卷',
                        style: const TextStyle(
                          fontSize: 12,
                          color: AppColors.inkFaint,
                        ),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  visualDensity: VisualDensity.compact,
                  onPressed: widget.onClose,
                  icon: const Icon(Icons.close, size: 18),
                ),
              ],
            ),
          ),
          if (_warn != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14),
              child: Text(
                _warn!,
                style: const TextStyle(
                  fontSize: 12,
                  color: Color(0xFFB1554A),
                ),
              ),
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 6, 12, 8),
            child: Container(
              decoration: BoxDecoration(
                color: AppColors.surfaceSunken,
                borderRadius: BorderRadius.circular(10),
              ),
              padding: const EdgeInsets.all(3),
              child: Row(
                children: [
                  Expanded(
                    child: _SegTab(
                      label: '卷',
                      active: _tab == 'books',
                      onTap: () => setState(() {
                        _tab = 'books';
                        _warn = null;
                      }),
                    ),
                  ),
                  Expanded(
                    child: _SegTab(
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
          Flexible(
            child: _tab == 'chapters'
                ? GridView.builder(
                    padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                    gridDelegate:
                        const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 5,
                      mainAxisSpacing: 8,
                      crossAxisSpacing: 8,
                    ),
                    itemCount: _selectedBook.chapterCount,
                    itemBuilder: (_, i) {
                      final n = i + 1;
                      final disabled =
                          allowed != null && !allowed.contains(n);
                      final isCurrent =
                          _selectedBook.id == widget.currentBook.id &&
                              n == widget.currentChapter;
                      return Material(
                        color: isCurrent
                            ? AppColors.accentDeep
                            : AppColors.surfaceSunken,
                        borderRadius: BorderRadius.circular(10),
                        child: InkWell(
                          onTap: disabled ? null : () => _tryPickChapter(n),
                          borderRadius: BorderRadius.circular(10),
                          child: Opacity(
                            opacity: disabled ? 0.35 : 1,
                            child: Center(
                              child: Text(
                                '$n',
                                style: TextStyle(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w600,
                                  color: isCurrent
                                      ? Colors.white
                                      : AppColors.ink,
                                ),
                              ),
                            ),
                          ),
                        ),
                      );
                    },
                  )
                : ListView(
                    padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                    children: [
                      if (ot.isNotEmpty) ...[
                        const _GroupLabel('旧约'),
                        _BookGrid(
                          books: ot,
                          selectedId: _selectedBookId,
                          onPick: _pickBook,
                        ),
                      ],
                      if (nt.isNotEmpty) ...[
                        const SizedBox(height: 10),
                        const _GroupLabel('新约'),
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
      ),
    );
  }
}

class _SegTab extends StatelessWidget {
  const _SegTab({
    required this.label,
    required this.active,
    required this.onTap,
  });
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

class _GroupLabel extends StatelessWidget {
  const _GroupLabel(this.text);
  final String text;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6, top: 2),
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
    return Wrap(
      spacing: 6,
      runSpacing: 6,
      children: [
        for (final b in books)
          Material(
            color: b.id == selectedId
                ? AppColors.accentWash
                : AppColors.surfaceSunken,
            borderRadius: BorderRadius.circular(8),
            child: InkWell(
              onTap: () => onPick(b),
              borderRadius: BorderRadius.circular(8),
              child: Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                child: Text(
                  bibleBookAbbr(b.name),
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: b.id == selectedId
                        ? AppColors.accentDeep
                        : AppColors.ink,
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}
