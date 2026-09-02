/// 书架阅读器（Android 全原生：HTML 分页 + PDF + 横滑翻页）。
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/theme.dart';
import 'shelf_checkin_sheet.dart';
import 'shelf_media_sheet.dart';
import 'shelf_paginated_prose.dart';
import 'shelf_pdf_page.dart';
import 'shelf_progress.dart';
import 'shelf_reading_prefs.dart';
import 'shelf_repository.dart';
import 'shelf_toc.dart';
import 'shelf_turn_gesture.dart';

class ShelfReaderScreen extends ConsumerStatefulWidget {
  const ShelfReaderScreen({
    super.key,
    required this.bookId,
    this.sectionId,
    this.pageIndex,
    this.groupId,
  });

  final String bookId;
  final String? sectionId;
  final int? pageIndex;
  final String? groupId;

  @override
  ConsumerState<ShelfReaderScreen> createState() => _ShelfReaderScreenState();
}

class _ShelfReaderScreenState extends ConsumerState<ShelfReaderScreen> {
  ShelfBookDetail? _book;
  ShelfSection? _section;
  var _loading = true;
  var _sectionLoading = false;
  String? _err;
  String? _sectionId;
  var _pageIndex = 0;
  var _pageCount = 1;
  var _chromeHidden = false;
  var _pendingLastPage = false;
  var _overlayOpen = 0;
  Timer? _progressTimer;
  final _pageBySection = <String, int>{};
  final _pageCountBySection = <String, int>{};

  bool get _blocked => _overlayOpen > 0;
  bool get _isPdfSection => _section?.hasPdfPrimary ?? false;

  @override
  void initState() {
    super.initState();
    _loadBook();
  }

  @override
  void dispose() {
    _progressTimer?.cancel();
    super.dispose();
  }

  Future<T?> _withOverlay<T>(Future<T?> Function() show) async {
    setState(() => _overlayOpen += 1);
    try {
      return await show();
    } finally {
      if (mounted) setState(() => _overlayOpen -= 1);
    }
  }

  void _flashBoundary(String edge) {
    HapticFeedback.lightImpact();
    final msg = edge == 'next' ? '已是最后一页' : '已是第一页';
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(msg),
        duration: const Duration(milliseconds: 1200),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  Future<void> _loadBook() async {
    setState(() {
      _loading = true;
      _err = null;
    });
    try {
      final repo = ref.read(shelfRepoProvider);
      final detail = await repo.getBook(widget.bookId);
      final progress = ShelfProgressStore(ref.read(prefsProvider)).loadBook(widget.bookId);
      final first = detail.sections.isNotEmpty ? detail.sections.first.id : null;
      final pick = widget.sectionId ?? progress?.sectionId ?? first;
      var page = 0;
      if (pick != null) {
        if (widget.sectionId == pick && widget.pageIndex != null) {
          page = widget.pageIndex!;
        } else if (progress?.sectionId == pick) {
          page = progress?.pageIndex ?? 0;
        }
        _pageBySection[pick] = page;
      }
      if (!mounted) return;
      setState(() {
        _book = detail;
        _sectionId = pick;
        _pageIndex = page;
        _loading = false;
      });
      if (pick != null) unawaited(_loadSection(pick));
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _err = '无法加载书目';
      });
    }
  }

  Future<void> _loadSection(String sectionId) async {
    setState(() => _sectionLoading = true);
    try {
      final section = await ref.read(shelfRepoProvider).getSection(widget.bookId, sectionId);
      if (!mounted) return;
      setState(() {
        _section = section;
        _sectionLoading = false;
        _pageCount = _pageCountBySection[sectionId] ?? 1;
      });
      if (_pendingLastPage) {
        setState(() {
          _pageIndex = (_pageCount - 1).clamp(0, 9999);
          _pendingLastPage = false;
        });
      }
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _sectionLoading = false;
        _err = '无法加载章节';
      });
    }
  }

  void _prefetchNeighbor(String edge) {
    final idx = _sectionIndex;
    if (idx < 0) return;
    final target = edge == 'next' ? idx + 1 : idx - 1;
    if (target < 0 || target >= _sections.length) return;
    final id = _sections[target].id;
    unawaited(() async {
      try {
        await ref.read(shelfRepoProvider).getSection(widget.bookId, id);
      } catch (_) {}
    }());
  }

  List<ShelfSectionSummary> get _sections => _book?.sections ?? const [];

  int get _sectionIndex => _sections.indexWhere((s) => s.id == _sectionId);

  bool get _canPrevSection => _sectionIndex > 0;
  bool get _canNextSection => _sectionIndex >= 0 && _sectionIndex < _sections.length - 1;
  bool get _canPrev =>
      _isPdfSection ? _canPrevSection : _pageIndex > 0 || _canPrevSection;
  bool get _canNext =>
      _isPdfSection ? _canNextSection : _pageIndex < _pageCount - 1 || _canNextSection;

  void _scheduleProgress() {
    _progressTimer?.cancel();
    _progressTimer = Timer(const Duration(milliseconds: 350), () {
      final sid = _sectionId;
      if (sid == null) return;
      ShelfProgressStore(ref.read(prefsProvider)).saveBook(
        widget.bookId,
        sid,
        pageIndex: _pageIndex,
        bookTitle: _book?.title,
        sectionTitle: _section?.title,
      );
      _pageBySection[sid] = _pageIndex;
    });
  }

  void _onPageCount(int count) {
    if (!mounted) return;
    setState(() {
      _pageCount = count.clamp(1, 9999);
      if (_sectionId != null) _pageCountBySection[_sectionId!] = _pageCount;
      if (_pageIndex >= _pageCount) {
        _pageIndex = _pageCount - 1;
      }
      if (_pendingLastPage) {
        _pageIndex = _pageCount - 1;
        _pendingLastPage = false;
      }
    });
  }

  void _onPageIndexChange(int index) {
    if (!mounted || index == _pageIndex) return;
    setState(() => _pageIndex = index);
    _scheduleProgress();
  }

  void _onPdfSectionEdge(String edge) {
    if (edge == 'next' && _canNextSection) {
      _goSection(_sections[_sectionIndex + 1].id, page: 0);
    } else if (edge == 'prev' && _canPrevSection) {
      _goSection(_sections[_sectionIndex - 1].id, lastPage: true);
    }
  }

  void _goSection(String? id, {int? page, bool lastPage = false}) {
    if (id == null) return;
    final cur = _sectionId;
    if (cur != null) _pageBySection[cur] = _pageIndex;
    setState(() {
      _sectionId = id;
      _section = null;
      _pageCount = _pageCountBySection[id] ?? 1;
      _chromeHidden = false;
      if (lastPage) {
        _pendingLastPage = true;
        _pageIndex = 0;
      } else if (page != null) {
        _pageIndex = page;
        _pageBySection[id] = page;
      } else {
        _pageIndex = _pageBySection[id] ?? 0;
      }
    });
    unawaited(_loadSection(id));
    _scheduleProgress();
  }

  void _turnNext() {
    if (_isPdfSection) {
      if (_canNextSection) {
        _goSection(_sections[_sectionIndex + 1].id, page: 0);
      }
      return;
    }
    if (_pageIndex < _pageCount - 1) {
      setState(() => _pageIndex += 1);
      _scheduleProgress();
      return;
    }
    if (_canNextSection) {
      final next = _sections[_sectionIndex + 1].id;
      _goSection(next, page: 0);
    }
  }

  void _turnPrev() {
    if (_isPdfSection) {
      if (_canPrevSection) {
        _goSection(_sections[_sectionIndex - 1].id, lastPage: true);
      }
      return;
    }
    if (_pageIndex > 0) {
      setState(() => _pageIndex -= 1);
      _scheduleProgress();
      return;
    }
    if (_canPrevSection) {
      final prev = _sections[_sectionIndex - 1].id;
      _goSection(prev, lastPage: true);
    }
  }

  void _toggleChrome() => setState(() => _chromeHidden = !_chromeHidden);

  Future<void> _openToc() async {
    final book = _book;
    if (book == null) return;
    final groups = buildShelfTocGroups(book.toc, bookType: book.bookType);
    await _withOverlay(
      () => showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        backgroundColor: AppColors.paper,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
        ),
        builder: (ctx) => DraggableScrollableSheet(
          expand: false,
          initialChildSize: 0.72,
          minChildSize: 0.4,
          maxChildSize: 0.92,
          builder: (_, scroll) => Column(
            children: [
              const SizedBox(height: 8),
              Container(
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                  color: AppColors.line,
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 12, 12, 8),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(book.title, style: AppTypography.title, maxLines: 2),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close, size: 20),
                      onPressed: () => Navigator.pop(ctx),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: ListView(
                  controller: scroll,
                  padding: const EdgeInsets.fromLTRB(12, 0, 12, 24),
                  children: [
                    for (final group in groups) ...[
                      if (groups.length > 1)
                        Padding(
                          padding: const EdgeInsets.fromLTRB(8, 12, 8, 6),
                          child: Text(group.label, style: AppTypography.meta),
                        ),
                      for (final item in group.items)
                        if (item.level == 1 && item.sectionId == null)
                          Padding(
                            padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
                            child: Text(
                              shelfTocDisplayTitle(item),
                              style: AppTypography.secondary.copyWith(fontWeight: FontWeight.w600),
                            ),
                          )
                        else
                          ListTile(
                            dense: true,
                            title: Text(shelfTocDisplayTitle(item)),
                            selected: resolveSectionId(item, _sections) == _sectionId,
                            enabled: resolveSectionId(item, _sections) != null,
                            onTap: () {
                              final sid = resolveSectionId(item, _sections);
                              if (sid == null) return;
                              Navigator.pop(ctx);
                              final saved = _pageBySection[sid] ?? 0;
                              _goSection(sid, page: saved);
                            },
                          ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _openFontSheet() async {
    final prefs = ref.read(shelfReadingPrefsProvider);
    await _withOverlay(
      () => showModalBottomSheet<void>(
        context: context,
        backgroundColor: AppColors.paper,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
        ),
        builder: (ctx) => SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text('字体', style: AppTypography.title),
                const SizedBox(height: 12),
                const Text('字体族', style: AppTypography.meta),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  children: [
                    for (final f in ShelfFontFamily.values)
                      ChoiceChip(
                        label: Text(shelfFontFamilyLabels[f]!),
                        selected: prefs.fontFamily == f,
                        onSelected: (_) async {
                          await ref.read(shelfReadingPrefsProvider.notifier).setFontFamily(f);
                          if (ctx.mounted) Navigator.pop(ctx);
                          setState(() => _pageCount = 1);
                        },
                      ),
                  ],
                ),
                const SizedBox(height: 16),
                const Text('字号', style: AppTypography.meta),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  children: [
                    for (final px in shelfFontSteps)
                      ChoiceChip(
                        label: Text('${px.toInt()}'),
                        selected: prefs.fontPx == px,
                        onSelected: (_) async {
                          await ref.read(shelfReadingPrefsProvider.notifier).setFontPx(px);
                          if (ctx.mounted) Navigator.pop(ctx);
                          setState(() => _pageCount = 1);
                        },
                      ),
                  ],
                ),
                const SizedBox(height: 16),
                const Text('行间距', style: AppTypography.meta),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  children: [
                    for (final lh in shelfLineHeightSteps)
                      ChoiceChip(
                        label: Text('$lh'),
                        selected: prefs.lineHeight == lh,
                        onSelected: (_) async {
                          await ref
                              .read(shelfReadingPrefsProvider.notifier)
                              .setLineHeight(lh);
                          if (ctx.mounted) Navigator.pop(ctx);
                          setState(() => _pageCount = 1);
                        },
                      ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _openMediaSheet(ShelfSection section) async {
    final images = section.attachments.where((a) => a.kind == 'image').toList();
    final videos = section.attachments.where((a) => a.kind == 'video').toList();
    if (images.isEmpty && videos.isEmpty) return;
    await _withOverlay(
      () => showShelfMediaSheet(
        context,
        repo: ref.read(shelfRepoProvider),
        bookId: widget.bookId,
        images: images,
        videos: videos,
      ),
    );
  }

  Widget _buildPrimary(ShelfSection section, ShelfReadingPrefs prefs, ShelfRepository repo) {
    if (section.hasProseHtml) {
      return ShelfPaginatedProse(
        key: ValueKey(
          '${section.id}:${prefs.fontPx}:${prefs.lineHeight}:${prefs.fontFamily.name}',
        ),
        html: section.html,
        pageIndex: _pageIndex,
        fontPx: prefs.fontPx,
        lineHeight: prefs.lineHeight,
        fontFamily: prefs.fontFamily,
        variantDocx: section.kind == 'lesson',
        onPageCount: _onPageCount,
        onTap: _toggleChrome,
      );
    }

    if (section.hasPdfPrimary && section.primary != null) {
      return ShelfPdfPageView(
        key: ValueKey(section.primary!.storageKey),
        repo: repo,
        bookId: widget.bookId,
        storageKey: section.primary!.storageKey,
        pageIndex: _pageIndex,
        canPrevSection: _canPrevSection,
        canNextSection: _canNextSection,
        onPageCount: _onPageCount,
        onPageIndexChange: _onPageIndexChange,
        onSectionEdge: _onPdfSectionEdge,
        onTap: _toggleChrome,
      );
    }

    return const Center(child: Text('暂无内容', style: AppTypography.meta));
  }

  Widget _buildContent(ShelfSection section) {
    final prefs = ref.watch(shelfReadingPrefsProvider);
    final repo = ref.read(shelfRepoProvider);
    final images = section.attachments.where((a) => a.kind == 'image').toList();
    final videos = section.attachments.where((a) => a.kind == 'video').toList();
    final hasMedia = images.isNotEmpty || videos.isNotEmpty;

    return Stack(
      fit: StackFit.expand,
      children: [
        AnimatedSwitcher(
          duration: const Duration(milliseconds: 180),
          child: KeyedSubtree(
            key: ValueKey(_sectionId),
            child: _buildPrimary(section, prefs, repo),
          ),
        ),
        if (hasMedia)
          Positioned(
            right: 12,
            bottom: 12,
            child: Material(
              color: AppColors.ink.withValues(alpha: 0.72),
              borderRadius: BorderRadius.circular(999),
              child: InkWell(
                borderRadius: BorderRadius.circular(999),
                onTap: () => unawaited(_openMediaSheet(section)),
                child: const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  child: Text('素材', style: TextStyle(color: Colors.white, fontSize: 13)),
                ),
              ),
            ),
          ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loading && _book == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('加载中…')),
        body: const Center(child: Text('加载中…', style: AppTypography.meta)),
      );
    }
    if (_err != null && _book == null) {
      return Scaffold(
        appBar: AppBar(
          leading: IconButton(
            icon: const Icon(Icons.arrow_back_ios_new, size: 20),
            onPressed: () => context.pop(),
          ),
        ),
        body: Center(child: Text(_err!, style: AppTypography.meta)),
      );
    }

    final book = _book!;
    final section = _section;
    final title = section?.title ?? book.title;
    final showBar = !_chromeHidden;
    final showPageIndicator = _pageCount > 1 && showBar;

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.dark.copyWith(statusBarColor: Colors.transparent),
      child: Scaffold(
        backgroundColor: AppColors.paper,
        appBar: showBar
            ? AppBar(
                backgroundColor: AppColors.paper,
                elevation: 0,
                scrolledUnderElevation: 0,
                leading: IconButton(
                  icon: const Icon(Icons.arrow_back_ios_new, size: 20),
                  onPressed: () => context.pop(),
                ),
                title: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (section?.unit != null && section!.unit!.isNotEmpty)
                      Text(section.unit!, style: AppTypography.meta),
                    Text(
                      title,
                      style: AppTypography.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              )
            : null,
        body: Stack(
          children: [
            Column(
              children: [
                Expanded(
                  child: ShelfSnapTurnGesture(
                    enabled: section != null && !_sectionLoading && !_blocked,
                    onTurnNext: _canNext ? _turnNext : null,
                    onTurnPrev: _canPrev ? _turnPrev : null,
                    onBoundary: _flashBoundary,
                    onApproachEdge: _prefetchNeighbor,
                    child: section == null
                        ? Center(
                            child: Text(
                              _sectionLoading ? '加载中…' : '暂无内容',
                              style: AppTypography.meta,
                            ),
                          )
                        : _buildContent(section),
                  ),
                ),
                if (showBar)
                  SafeArea(
                    top: false,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      child: Row(
                        children: [
                          Expanded(
                            child: TextButton.icon(
                              onPressed: () => unawaited(_openToc()),
                              icon: const Icon(Icons.menu, size: 20),
                              label: const Text('目录'),
                            ),
                          ),
                          Expanded(
                            child: TextButton.icon(
                              onPressed: () => unawaited(_openFontSheet()),
                              icon: const Icon(Icons.text_fields, size: 20),
                              label: const Text('字体'),
                            ),
                          ),
                          Expanded(
                            child: TextButton.icon(
                              onPressed: _sectionId == null
                                  ? null
                                  : () => unawaited(
                                        _withOverlay(
                                          () => showShelfCheckinSheet(
                                            context,
                                            ref,
                                            bookId: widget.bookId,
                                            bookTitle: book.title,
                                            sectionId: _sectionId!,
                                            sectionTitle: section?.title ?? '',
                                            pageIndex: _pageIndex,
                                            presetGroupId: widget.groupId,
                                          ),
                                        ),
                                      ),
                              icon: const Icon(Icons.share_outlined, size: 20),
                              label: const Text('分享'),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
            if (showPageIndicator)
              Positioned(
                left: 0,
                right: 0,
                bottom: showBar ? 56 : 16,
                child: Center(
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: AppColors.ink.withValues(alpha: 0.06),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      '${_pageIndex + 1} / $_pageCount',
                      style: AppTypography.meta.copyWith(fontSize: 12),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
