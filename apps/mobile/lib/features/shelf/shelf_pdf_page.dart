/// 书架 PDF 纵向连滚（节内上下滑页；左右滑切节，对齐 SHELF-READING 契约）。
library;

import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:pdfx/pdfx.dart';

import '../../core/theme.dart';
import 'shelf_repository.dart';

class ShelfPdfPageView extends StatefulWidget {
  const ShelfPdfPageView({
    super.key,
    required this.repo,
    required this.bookId,
    required this.storageKey,
    required this.pageIndex,
    this.canPrevSection = false,
    this.canNextSection = false,
    this.childrenLesson = false,
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
  final bool canPrevSection;
  final bool canNextSection;
  final bool childrenLesson;
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
  var _pageCount = 1;
  var _syncingPage = false;

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
    if (!_syncingPage &&
        oldWidget.pageIndex != widget.pageIndex &&
        _controller != null) {
      final page = (widget.pageIndex + 1).clamp(1, _pageCount);
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

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    _controller?.dispose();
    _controller = null;
    try {
      final bytes = await widget.repo.fetchAssetBytes(
        widget.bookId,
        widget.storageKey,
      );
      final data = Uint8List.fromList(bytes);
      final count = (await PdfDocument.openData(data)).pagesCount;
      final initial = (widget.pageIndex + 1).clamp(1, count);
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
        _pageCount = count;
        _loading = false;
      });
      widget.onPageCount?.call(count);
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = '无法加载 PDF';
      });
    }
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
              onPageChanged: (page) {
                if (_syncingPage) return;
                widget.onPageIndexChange?.call(page - 1);
              },
              builders: PdfViewPinchBuilders<DefaultBuilderOptions>(
                options: const DefaultBuilderOptions(),
                documentLoaderBuilder: (_) =>
                    const Center(child: Text('正在加载 PDF…', style: AppTypography.meta)),
                pageLoaderBuilder: (_) => const SizedBox.shrink(),
                errorBuilder: (_, __) =>
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
