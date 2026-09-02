/// 书架 PDF 单页（适页 / 全屏捏合，节内横滑由外层手势翻页）。
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
    this.fullscreen = false,
    this.onPageCount,
    this.onTap,
    this.onExitFullscreen,
  });

  final ShelfRepository repo;
  final String bookId;
  final String storageKey;
  final int pageIndex;
  final bool fullscreen;
  final ValueChanged<int>? onPageCount;
  final VoidCallback? onTap;
  final VoidCallback? onExitFullscreen;

  @override
  State<ShelfPdfPageView> createState() => _ShelfPdfPageViewState();
}

class _ShelfPdfPageViewState extends State<ShelfPdfPageView> {
  PdfController? _controller;
  PdfControllerPinch? _pinchController;
  var _loading = true;
  String? _error;
  var _pageCount = 1;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(covariant ShelfPdfPageView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.storageKey != widget.storageKey ||
        oldWidget.bookId != widget.bookId ||
        oldWidget.fullscreen != widget.fullscreen) {
      _load();
      return;
    }
    if (!widget.fullscreen && oldWidget.pageIndex != widget.pageIndex && _controller != null) {
      final page = (widget.pageIndex + 1).clamp(1, _pageCount);
      _controller!.jumpToPage(page);
    }
  }

  @override
  void dispose() {
    _controller?.dispose();
    _pinchController?.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    await _controller?.dispose();
    await _pinchController?.dispose();
    _controller = null;
    _pinchController = null;
    try {
      final bytes = await widget.repo.fetchAssetBytes(
        widget.bookId,
        widget.storageKey,
      );
      final data = Uint8List.fromList(bytes);
      final count = (await PdfDocument.openData(data)).pagesCount;
      final initial = (widget.pageIndex + 1).clamp(1, count);
      if (!mounted) return;
      if (widget.fullscreen) {
        final ctrl = PdfControllerPinch(
          document: PdfDocument.openData(data),
          initialPage: initial,
        );
        setState(() {
          _pinchController = ctrl;
          _pageCount = count;
          _loading = false;
        });
      } else {
        final ctrl = PdfController(
          document: PdfDocument.openData(data),
          initialPage: initial,
        );
        setState(() {
          _controller = ctrl;
          _pageCount = count;
          _loading = false;
        });
      }
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
    if (_error != null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(_error!, style: AppTypography.meta),
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

    if (widget.fullscreen && _pinchController != null) {
      return Stack(
        fit: StackFit.expand,
        children: [
          PdfViewPinch(
            controller: _pinchController!,
            padding: 8,
            builders: PdfViewPinchBuilders<DefaultBuilderOptions>(
              options: const DefaultBuilderOptions(),
              documentLoaderBuilder: (_) =>
                  const Center(child: Text('正在加载 PDF…', style: AppTypography.meta)),
              pageLoaderBuilder: (_) => const SizedBox.shrink(),
              errorBuilder: (_, __) =>
                  const Center(child: Text('无法渲染 PDF 页', style: AppTypography.meta)),
            ),
          ),
          SafeArea(
            child: Align(
              alignment: Alignment.topRight,
              child: IconButton(
                icon: const Icon(Icons.fullscreen_exit, color: AppColors.ink),
                tooltip: '退出全屏',
                onPressed: widget.onExitFullscreen,
              ),
            ),
          ),
        ],
      );
    }

    if (_controller == null) {
      return const Center(child: Text('无法加载 PDF', style: AppTypography.meta));
    }

    return GestureDetector(
      onTap: widget.onTap,
      behavior: HitTestBehavior.translucent,
      child: PdfView(
        controller: _controller!,
        padding: 10,
        builders: PdfViewBuilders<DefaultBuilderOptions>(
          options: const DefaultBuilderOptions(),
          documentLoaderBuilder: (_) =>
              const Center(child: Text('正在加载 PDF…', style: AppTypography.meta)),
          pageLoaderBuilder: (_) => const SizedBox.shrink(),
          errorBuilder: (_, __) =>
              const Center(child: Text('无法渲染 PDF 页', style: AppTypography.meta)),
        ),
      ),
    );
  }
}
