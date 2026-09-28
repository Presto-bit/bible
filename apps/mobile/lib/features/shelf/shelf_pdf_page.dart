/// 书架 PDF 纵向连滚（节内上下滑页；左右滑切节，对齐 SHELF-READING 契约）。
library;

import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:pdfx/pdfx.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/theme.dart';
import 'shelf_reader_contract.dart';
import 'shelf_repository.dart';

class ShelfPdfPageView extends StatefulWidget {
  const ShelfPdfPageView({
    super.key,
    required this.repo,
    required this.bookId,
    required this.storageKey,
    required this.pageIndex,
    this.pageStart = 0,
    this.pageEnd,
    this.canPrevSection = false,
    this.canNextSection = false,
    this.childrenLesson = false,
    this.prefs,
    this.onPageCount,
    this.onPageIndexChange,
    this.onSectionEdge,
    this.onTap,
    this.onPinchActive,
  });

  final ShelfRepository repo;
  final String bookId;
  final String storageKey;
  final int pageIndex;
  /// 本节在 PDF 中的起始页（0-based，含）
  final int pageStart;
  /// 本节在 PDF 中的结束页（0-based，含）；null = 文末
  final int? pageEnd;
  final bool canPrevSection;
  final bool canNextSection;
  final bool childrenLesson;
  final SharedPreferences? prefs;
  final ValueChanged<int>? onPageCount;
  final ValueChanged<int>? onPageIndexChange;
  final ValueChanged<String>? onSectionEdge;
  final VoidCallback? onTap;
  final ValueChanged<bool>? onPinchActive;

  @override
  State<ShelfPdfPageView> createState() => _ShelfPdfPageViewState();
}

class _ShelfPdfPageViewState extends State<ShelfPdfPageView> {
  PdfControllerPinch? _controller;
  var _loading = true;
  String? _error;
  var _fullPageCount = 1;
  var _syncingPage = false;
  double? _fitScale;
  double _targetRelativeZoom = shelfPdfZoomDefault;
  var _appliedInitialZoom = false;
  SharedPreferences? _prefs;

  int get _rangeStart => widget.pageStart < 0 ? 0 : widget.pageStart;

  int get _rangeEnd {
    final end = widget.pageEnd;
    if (end == null) return _fullPageCount - 1;
    return end.clamp(_rangeStart, _fullPageCount - 1);
  }

  int get _sectionPageCount => (_rangeEnd - _rangeStart + 1).clamp(1, _fullPageCount);

  int _absPageFromRelative(int relative) =>
      (_rangeStart + relative.clamp(0, _sectionPageCount - 1) + 1);

  int _relativeFromAbs(int absOneBased) =>
      (absOneBased - 1 - _rangeStart).clamp(0, _sectionPageCount - 1);

  double get _defaultZoom =>
      widget.childrenLesson ? shelfChildrenPdfDefaultZoom : shelfPdfZoomDefault;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(covariant ShelfPdfPageView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.storageKey != widget.storageKey ||
        oldWidget.bookId != widget.bookId) {
      _load();
      return;
    }
    if (oldWidget.childrenLesson != widget.childrenLesson ||
        oldWidget.prefs != widget.prefs) {
      _reloadTargetZoom();
    }
    final rangeChanged =
        oldWidget.pageStart != widget.pageStart || oldWidget.pageEnd != widget.pageEnd;
    if (rangeChanged && _controller != null) {
      widget.onPageCount?.call(_sectionPageCount);
      final page = _absPageFromRelative(0);
      _syncingPage = true;
      _controller!.jumpToPage(page);
      Future<void>.delayed(const Duration(milliseconds: 120), () {
        if (mounted) _syncingPage = false;
      });
      return;
    }
    if (!_syncingPage &&
        oldWidget.pageIndex != widget.pageIndex &&
        _controller != null) {
      final page = _absPageFromRelative(widget.pageIndex);
      _syncingPage = true;
      _controller!.jumpToPage(page);
      Future<void>.delayed(const Duration(milliseconds: 120), () {
        if (mounted) _syncingPage = false;
      });
    }
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  void _reloadTargetZoom() {
    final prefs = _prefs ?? widget.prefs;
    if (prefs == null) {
      _targetRelativeZoom = _defaultZoom;
      return;
    }
    _targetRelativeZoom = readShelfPdfZoom(
      prefs,
      bookId: widget.bookId,
      fallback: _defaultZoom,
    );
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
      _fitScale = null;
      _appliedInitialZoom = false;
    });
    _controller?.dispose();
    _controller = null;
    try {
      _prefs = widget.prefs ?? await SharedPreferences.getInstance();
      _reloadTargetZoom();
      final bytes = await widget.repo.fetchAssetBytes(
        widget.bookId,
        widget.storageKey,
      );
      final data = Uint8List.fromList(bytes);
      final count = (await PdfDocument.openData(data)).pagesCount;
      _fullPageCount = count;
      final initial = _absPageFromRelative(widget.pageIndex);
      final ctrl = PdfControllerPinch(
        document: PdfDocument.openData(data),
        initialPage: initial,
      );
      if (!mounted) {
        ctrl.dispose();
        return;
      }
      setState(() {
        _controller = ctrl;
        _loading = false;
      });
      widget.onPageCount?.call(_sectionPageCount);
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = '无法加载 PDF';
      });
    }
  }

  Future<void> _applySavedZoom() async {
    final ctrl = _controller;
    if (ctrl == null || _appliedInitialZoom || !mounted) return;
    for (var i = 0; i < 12; i++) {
      if (!mounted || _controller != ctrl) return;
      final fit = ctrl.calculatePageFitMatrix(pageNumber: ctrl.page);
      if (fit != null) {
        _fitScale = fit.getMaxScaleOnAxis();
        final relative = clampShelfPdfZoom(_targetRelativeZoom);
        if ((relative - 1.0).abs() > 0.02) {
          final zoomed = Matrix4.copy(fit)..scaleByDouble(relative, relative, 1.0, 1.0);
          await ctrl.goTo(destination: zoomed, duration: Duration.zero);
        }
        _appliedInitialZoom = true;
        return;
      }
      await Future<void>.delayed(const Duration(milliseconds: 40));
    }
  }

  void _captureFitScale() {
    final ctrl = _controller;
    if (ctrl == null || _fitScale != null) return;
    final fit = ctrl.calculatePageFitMatrix(pageNumber: ctrl.page);
    if (fit != null) _fitScale = fit.getMaxScaleOnAxis();
  }

  void _persistCurrentZoom() {
    final ctrl = _controller;
    final prefs = _prefs ?? widget.prefs;
    final fit = _fitScale;
    if (ctrl == null || prefs == null || fit == null || fit <= 0) return;
    final relative = clampShelfPdfZoom(ctrl.zoomRatio / fit);
    _targetRelativeZoom = relative;
    unawaited(writeShelfPdfZoom(prefs, relative, bookId: widget.bookId));
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: Text('正在加载 PDF…', style: AppTypography.meta));
    }
    if (_error != null || _controller == null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(_error ?? '无法加载 PDF', style: AppTypography.meta),
            const SizedBox(height: 8),
            TextButton(
              onPressed: () {
                final url = widget.repo.assetUrl(widget.bookId, widget.storageKey);
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text('链接：$url')),
                );
              },
              child: const Text('查看链接'),
            ),
          ],
        ),
      );
    }

    return GestureDetector(
      onTap: widget.onTap,
      behavior: HitTestBehavior.translucent,
      child: Column(
        children: [
          Expanded(
            child: PdfViewPinch(
              controller: _controller!,
              scrollDirection: Axis.vertical,
              padding: 8,
              minScale: 1.0,
              maxScale: 4.0,
              onDocumentLoaded: (_) {
                WidgetsBinding.instance.addPostFrameCallback((_) {
                  unawaited(_applySavedZoom());
                });
              },
              onInteractionStart: (_) {
                _captureFitScale();
                widget.onPinchActive?.call(true);
              },
              onInteractionEnd: (_) {
                widget.onPinchActive?.call(false);
                _persistCurrentZoom();
              },
              onPageChanged: (page) {
                if (_syncingPage) return;
                final start1 = _rangeStart + 1;
                final end1 = _rangeEnd + 1;
                if (page < start1) {
                  _syncingPage = true;
                  _controller!.jumpToPage(start1);
                  Future<void>.delayed(const Duration(milliseconds: 80), () {
                    if (mounted) _syncingPage = false;
                  });
                  return;
                }
                if (page > end1) {
                  _syncingPage = true;
                  _controller!.jumpToPage(end1);
                  Future<void>.delayed(const Duration(milliseconds: 80), () {
                    if (mounted) _syncingPage = false;
                  });
                  return;
                }
                widget.onPageIndexChange?.call(_relativeFromAbs(page));
              },
              builders: PdfViewPinchBuilders<DefaultBuilderOptions>(
                options: const DefaultBuilderOptions(),
                documentLoaderBuilder: (_) =>
                    const Center(child: Text('正在加载 PDF…', style: AppTypography.meta)),
                pageLoaderBuilder: (_) => const SizedBox.shrink(),
                errorBuilder: (_, error) =>
                    const Center(child: Text('无法渲染 PDF 页', style: AppTypography.meta)),
              ),
            ),
          ),
          if (widget.canNextSection || widget.canPrevSection)
            const Padding(
              padding: EdgeInsets.fromLTRB(16, 4, 16, 12),
              child: Text(
                '左右滑动切换章节',
                style: AppTypography.meta,
                textAlign: TextAlign.center,
              ),
            ),
        ],
      ),
    );
  }
}
