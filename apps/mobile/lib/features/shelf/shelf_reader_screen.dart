/// 书架阅读器（Android 全原生：竖滚读内容 + 横滑切节，对齐 PWA）。
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/theme.dart';
import 'shelf_checkin_sheet.dart';
import 'shelf_lesson_media_dock.dart';
import 'shelf_media_sheet.dart';
import 'shelf_paginated_prose.dart';
import 'shelf_pdf_page.dart';
import 'shelf_post_sheets.dart';
import 'shelf_posts_repository.dart';
import 'shelf_library_store.dart';
import 'shelf_progress.dart';
import 'shelf_reader_contract.dart';
import 'shelf_reading_prefs.dart';
import 'shelf_repository.dart';
import 'shelf_scroll_anchor.dart';
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
  var _pendingScrollEnd = false;
  var _flowScrollRatio = 0.0;
  final _flowScrollRatioN = ValueNotifier<double>(0);
  ShelfScrollAnchor? _flowScrollAnchor;
  var _proseSelecting = false;
  var _pdfPinching = false;
  var _overlayOpen = 0;
  List<ShelfPost> _publicNotes = const [];
  Timer? _progressTimer;
  final _pageBySection = <String, int>{};
  final _scrollBySection = <String, double>{};
  final _scrollAnchorBySection = <String, ShelfScrollAnchor>{};
  final _pageCountBySection = <String, int>{};

  bool get _blocked => _overlayOpen > 0 || _pdfPinching;
  bool get _isPdfSection => _section?.hasPdfPrimary ?? false;

  @override
  void initState() {
    super.initState();
    _loadBook();
  }

  @override
  void dispose() {
    _progressTimer?.cancel();
    _flowScrollRatioN.dispose();
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
      double? scroll;
      ShelfScrollAnchor? scrollAnchor;
      if (pick != null) {
        if (widget.sectionId == pick && widget.pageIndex != null) {
          page = widget.pageIndex!;
        } else if (progress?.sectionId == pick) {
          page = progress?.pageIndex ?? 0;
          scroll = progress?.scrollOffset;
          scrollAnchor = progress?.scrollAnchor;
        }
        _pageBySection[pick] = page;
        if (scroll != null) _scrollBySection[pick] = scroll;
        if (scrollAnchor != null) _scrollAnchorBySection[pick] = scrollAnchor;
      }
      if (!mounted) return;
      setState(() {
        _book = detail;
        _sectionId = pick;
        _pageIndex = page;
        _flowScrollRatio = scroll ?? 0;
        _flowScrollRatioN.value = _flowScrollRatio;
        _flowScrollAnchor = scrollAnchor;
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
    final repo = ref.read(shelfRepoProvider);
    final cached = repo.peekSection(widget.bookId, sectionId);
    if (cached != null && !cached.docxHtmlLooksLegacy && mounted) {
      setState(() {
        _section = cached;
        _sectionLoading = false;
        _pageCount = _pageCountBySection[sectionId] ?? 1;
      });
    } else if (mounted) {
      setState(() => _sectionLoading = true);
    }
    try {
      final section = await repo.getSection(widget.bookId, sectionId);
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
      if (_pendingScrollEnd) {
        setState(() => _pendingScrollEnd = false);
      }
      unawaited(_loadPublicNotes(sectionId));
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _sectionLoading = false;
        _err = '无法加载章节';
      });
    }
  }

  Future<void> _loadPublicNotes(String sectionId) async {
    try {
      final items = await ref.read(shelfPostsRepoProvider).sectionPublicNotes(widget.bookId, sectionId);
      if (mounted) setState(() => _publicNotes = items);
    } catch (_) {
      if (mounted) setState(() => _publicNotes = const []);
    }
  }

  Future<void> _openCommentsSheet() async {
    final book = _book;
    final section = _section;
    if (book == null || section == null || _sectionId == null) return;
    await showShelfCommentsSheet(
      context,
      ref,
      bookId: widget.bookId,
      bookTitle: book.title,
      sectionId: _sectionId!,
      sectionTitle: section.title,
      pageIndex: _pageIndex,
    );
  }

  void _prefetchNeighbor(String edge) {
    final idx = _sectionIndex;
    if (idx < 0) return;
    final target = edge == 'next' ? idx + 1 : idx - 1;
    if (target < 0 || target >= _sections.length) return;
    final id = _sections[target].id;
    unawaited(ref.read(shelfRepoProvider).prefetchSection(widget.bookId, id));
  }

  List<ShelfSectionSummary> get _sections => _book?.sections ?? const [];

  int get _sectionIndex => _sections.indexWhere((s) => s.id == _sectionId);

  bool get _canPrevSection => _sectionIndex > 0;
  bool get _canNextSection => _sectionIndex >= 0 && _sectionIndex < _sections.length - 1;
  bool get _canPrev => _isPdfSection ? _canPrevSection : _canPrevSection;
  bool get _canNext => _isPdfSection ? _canNextSection : _canNextSection;

  bool get _isChildrenLesson =>
      shelfIsChildrenLessonBook(id: _book?.id, title: _book?.title);

  void _scheduleProgress() {
    _progressTimer?.cancel();
    _progressTimer = Timer(const Duration(milliseconds: 350), () {
      final sid = _sectionId;
      if (sid == null) return;
      final sectionIdx = _sectionIndex >= 0 ? _sectionIndex : 0;
      final totalSections = _sections.isEmpty ? 1 : _sections.length;
      final progressRatio = _isPdfSection
          ? ((_pageIndex + 1) / _pageCount.clamp(1, 9999)).clamp(0.0, 1.0)
          : ((sectionIdx + _flowScrollRatio) / totalSections).clamp(0.0, 1.0);
      final progressStore = ShelfProgressStore(ref.read(prefsProvider));
      progressStore.saveBook(
        widget.bookId,
        sid,
        pageIndex: _isPdfSection ? _pageIndex : 0,
        scrollOffset: _isPdfSection ? null : _flowScrollRatio,
        scrollAnchor: _isPdfSection ? null : _flowScrollAnchor,
        progressRatio: progressRatio,
        bookTitle: _book?.title,
        sectionTitle: _section?.title,
      );
      ShelfLibraryStore(ref.read(prefsProvider), progressStore).touchLastRead(widget.bookId);
      if (_isPdfSection) {
        _pageBySection[sid] = _pageIndex;
      } else {
        _scrollBySection[sid] = _flowScrollRatio;
        if (_flowScrollAnchor != null) {
          _scrollAnchorBySection[sid] = _flowScrollAnchor!;
        }
      }
    });
  }

  void _onFlowScrollProgress(double ratio) {
    _flowScrollRatio = ratio;
    if (_flowScrollRatioN.value != ratio) {
      _flowScrollRatioN.value = ratio;
    }
    _scheduleProgress();
  }

  void _onFlowScrollAnchor(ShelfScrollAnchor anchor) {
    _flowScrollAnchor = anchor;
    _scheduleProgress();
  }

  void _onProseSectionEdge(String edge) {
    if (edge == 'next' && _canNextSection) {
      _goSection(_sections[_sectionIndex + 1].id, scrollStart: true);
    } else if (edge == 'prev' && _canPrevSection) {
      _goSection(_sections[_sectionIndex - 1].id, scrollEnd: true);
    }
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
      _goSection(_sections[_sectionIndex + 1].id, page: 0, scrollStart: true);
    } else if (edge == 'prev' && _canPrevSection) {
      _goSection(_sections[_sectionIndex - 1].id, lastPage: true);
    }
  }

  void _goSection(
    String? id, {
    int? page,
    bool lastPage = false,
    bool scrollStart = false,
    bool scrollEnd = false,
  }) {
    if (id == null) return;
    final cur = _sectionId;
    if (cur != null) {
      if (_isPdfSection) {
        _pageBySection[cur] = _pageIndex;
      } else {
        _scrollBySection[cur] = _flowScrollRatio;
        if (_flowScrollAnchor != null) {
          _scrollAnchorBySection[cur] = _flowScrollAnchor!;
        }
      }
    }
    final savedScroll = _scrollBySection[id] ?? 0.0;
    final savedAnchor = _scrollAnchorBySection[id];
    final cached = ref.read(shelfRepoProvider).peekSection(widget.bookId, id);
    setState(() {
      _sectionId = id;
      if (cached != null && !cached.docxHtmlLooksLegacy) {
        _section = cached;
        _sectionLoading = false;
      } else {
        _sectionLoading = true;
      }
      _pageCount = _pageCountBySection[id] ?? 1;
      _chromeHidden = false;
      _pendingScrollEnd = scrollEnd;
      if (lastPage) {
        _pendingLastPage = true;
        _pageIndex = 0;
      } else if (page != null) {
        _pageIndex = page;
        _pageBySection[id] = page;
      } else {
        _pageIndex = _pageBySection[id] ?? 0;
      }
      _flowScrollRatio = scrollStart ? 0 : (scrollEnd ? 1 : savedScroll);
      _flowScrollRatioN.value = _flowScrollRatio;
      _flowScrollAnchor = scrollStart || scrollEnd ? null : savedAnchor;
    });
    unawaited(_loadSection(id));
    _scheduleProgress();
  }

  void _turnNext() {
    if (_canNextSection) {
      _goSection(
        _sections[_sectionIndex + 1].id,
        page: 0,
        scrollStart: true,
      );
    }
  }

  void _turnPrev() {
    if (_canPrevSection) {
      _goSection(
        _sections[_sectionIndex - 1].id,
        lastPage: _isPdfSection,
        scrollEnd: !_isPdfSection,
      );
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
                              _goSection(sid);
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
                        label: Text(shelfFontStepLabels[px] ?? '${px.toInt()}'),
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
                        label: Text(shelfLineHeightLabels[lh] ?? '$lh'),
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

  Future<void> _openMediaSheet(
    ShelfSection section, {
    ShelfAttachment? initialVideo,
  }) async {
    final images = section.attachments.where((a) => a.kind == 'image').toList();
    final videos = section.attachments.where((a) => a.kind == 'video').toList();
    final audios = section.attachments.where((a) => a.kind == 'audio').toList();
    if (images.isEmpty && videos.isEmpty && audios.isEmpty) return;
    if (initialVideo != null) {
      final url = ref.read(shelfRepoProvider).assetUrl(widget.bookId, initialVideo.storageKey);
      await Clipboard.setData(ClipboardData(text: url));
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('已复制「${initialVideo.title}」视频链接')),
      );
      return;
    }
    await _withOverlay(
      () => showShelfMediaSheet(
        context,
        repo: ref.read(shelfRepoProvider),
        bookId: widget.bookId,
        images: images,
        videos: videos,
        audios: audios,
      ),
    );
  }

  Widget _buildPrimary(ShelfSection section, ShelfReadingPrefs prefs, ShelfRepository repo) {
    if (section.hasProseHtml) {
      return ShelfPaginatedProse(
        key: ValueKey(
          '${section.id}:${prefs.fontPx}:${prefs.lineHeight}:${prefs.fontFamily.name}',
        ),
        bookId: widget.bookId,
        sectionId: section.id,
        html: section.html,
        fontPx: prefs.fontPx,
        lineHeight: prefs.lineHeight,
        fontFamily: prefs.fontFamily,
        variantDocx: section.kind == 'lesson',
        lessonTone: _isChildrenLesson && section.kind == 'lesson',
        scrollOffset: _scrollBySection[section.id] ?? _flowScrollRatio,
        scrollAnchor: _scrollAnchorBySection[section.id] ?? _flowScrollAnchor,
        scrollToEnd: _pendingScrollEnd,
        onTap: _toggleChrome,
        onScrollProgress: _onFlowScrollProgress,
        onScrollAnchor: _onFlowScrollAnchor,
        onSectionEdge: _onProseSectionEdge,
        onSelectionActiveChanged: (active) {
          _proseSelecting = active;
        },
        publicNotes: _publicNotes,
        onPublicNotesChanged: () {
          final sid = _sectionId;
          if (sid != null) unawaited(_loadPublicNotes(sid));
        },
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
        childrenLesson: _isChildrenLesson && section.kind == 'lesson',
        onPageCount: _onPageCount,
        onPageIndexChange: _onPageIndexChange,
        onSectionEdge: _onPdfSectionEdge,
        onTap: _toggleChrome,
        onPinchActive: (active) {
          if (mounted) setState(() => _pdfPinching = active);
        },
      );
    }

    return const Center(child: Text('暂无内容', style: AppTypography.meta));
  }

  Widget _buildContent(ShelfSection section) {
    final prefs = ref.watch(shelfReadingPrefsProvider);
    final repo = ref.read(shelfRepoProvider);
    final images = section.attachments.where((a) => a.kind == 'image').toList();
    final videos = section.attachments.where((a) => a.kind == 'video').toList();
    final audios = section.attachments.where((a) => a.kind == 'audio').toList();
    final hasMedia = images.isNotEmpty || videos.isNotEmpty || audios.isNotEmpty;
    final isLesson = section.kind == 'lesson';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (isLesson && hasMedia && !_chromeHidden)
          ShelfLessonMediaDock(
            videos: videos,
            images: images,
            audios: audios,
            onOpenAll: () => unawaited(_openMediaSheet(section)),
            onOpenVideo: (item) => unawaited(_openMediaSheet(section, initialVideo: item)),
          ),
        Expanded(
          child: KeyedSubtree(
            key: ValueKey(_sectionId),
            child: _buildPrimary(section, prefs, repo),
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
    final showPageIndicator = _isPdfSection && _pageCount > 1 && showBar;

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
                  onPressed: () => context.go('/shelf/${widget.bookId}'),
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
                    enabled: section != null && !_blocked,
                    edgeOnly: false,
                    shouldYieldTurn: () => _proseSelecting,
                    hitIsProseContent: (_) => section != null && section.hasProseHtml,
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
                              onPressed: () => unawaited(_openCommentsSheet()),
                              icon: const Icon(Icons.chat_bubble_outline, size: 20),
                              label: const Text('评论'),
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
            if (!_isPdfSection && section != null && showBar)
              Positioned(
                left: 16,
                right: 16,
                bottom: 52,
                child: IgnorePointer(
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(999),
                    child: ValueListenableBuilder<double>(
                      valueListenable: _flowScrollRatioN,
                      builder: (context, ratio, _) => LinearProgressIndicator(
                        value: ratio.clamp(0.01, 1.0),
                        minHeight: 2,
                        backgroundColor: AppColors.ink.withValues(alpha: 0.08),
                        color: AppColors.ink.withValues(alpha: 0.28),
                      ),
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
