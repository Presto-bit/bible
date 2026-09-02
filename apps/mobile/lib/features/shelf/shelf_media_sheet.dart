/// 教案素材（图片 / 视频列表，对齐 Web ShelfMediaSheet）。
library;

import 'dart:async' show unawaited;
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/theme.dart';
import 'shelf_repository.dart';

Future<void> showShelfMediaSheet(
  BuildContext context, {
  required ShelfRepository repo,
  required String bookId,
  required List<ShelfAttachment> images,
  required List<ShelfAttachment> videos,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppColors.paper,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
    ),
    builder: (ctx) => DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.55,
      minChildSize: 0.35,
      maxChildSize: 0.9,
      builder: (_, scroll) => _ShelfMediaBody(
        scroll: scroll,
        repo: repo,
        bookId: bookId,
        images: images,
        videos: videos,
      ),
    ),
  );
}

class _ShelfMediaBody extends StatefulWidget {
  const _ShelfMediaBody({
    required this.scroll,
    required this.repo,
    required this.bookId,
    required this.images,
    required this.videos,
  });

  final ScrollController scroll;
  final ShelfRepository repo;
  final String bookId;
  final List<ShelfAttachment> images;
  final List<ShelfAttachment> videos;

  @override
  State<_ShelfMediaBody> createState() => _ShelfMediaBodyState();
}

class _ShelfMediaBodyState extends State<_ShelfMediaBody> {
  String? _expandedImageId;
  final _imageBytes = <String, Uint8List>{};

  Future<void> _loadImage(ShelfAttachment item) async {
    if (_imageBytes.containsKey(item.id)) return;
    try {
      final bytes = await widget.repo.fetchAssetBytes(widget.bookId, item.storageKey);
      if (!mounted) return;
      setState(() => _imageBytes[item.id] = Uint8List.fromList(bytes));
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    if (_expandedImageId != null) {
      final item = widget.images.firstWhere((i) => i.id == _expandedImageId);
      final bytes = _imageBytes[item.id];
      return Stack(
        fit: StackFit.expand,
        children: [
          ColoredBox(
            color: Colors.black.withValues(alpha: 0.92),
            child: InteractiveViewer(
              child: Center(
                child: bytes != null
                    ? Image.memory(bytes, fit: BoxFit.contain)
                    : const CircularProgressIndicator(color: Colors.white54),
              ),
            ),
          ),
          SafeArea(
            child: Align(
              alignment: Alignment.topRight,
              child: IconButton(
                icon: const Icon(Icons.close, color: Colors.white),
                onPressed: () => setState(() => _expandedImageId = null),
              ),
            ),
          ),
        ],
      );
    }

    return ListView(
      controller: widget.scroll,
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
      children: [
        Center(
          child: Container(
            width: 36,
            height: 4,
            decoration: BoxDecoration(
              color: AppColors.line,
              borderRadius: BorderRadius.circular(999),
            ),
          ),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            const Expanded(child: Text('本课素材', style: AppTypography.title)),
            TextButton(onPressed: () => Navigator.pop(context), child: const Text('关闭')),
          ],
        ),
        if (widget.videos.isNotEmpty) ...[
          const SizedBox(height: 16),
          Text('视频', style: AppTypography.meta.copyWith(fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          for (final item in widget.videos)
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: AppColors.line.withValues(alpha: 0.35),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(Icons.play_arrow, size: 22),
              ),
              title: Text(item.title, style: AppTypography.secondary),
              onTap: () async {
                final url = widget.repo.assetUrl(widget.bookId, item.storageKey);
                await Clipboard.setData(ClipboardData(text: url));
                if (!context.mounted) return;
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text('已复制「${item.title}」链接')),
                );
              },
            ),
        ],
        if (widget.images.isNotEmpty) ...[
          const SizedBox(height: 16),
          Text('图片', style: AppTypography.meta.copyWith(fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              crossAxisSpacing: 10,
              mainAxisSpacing: 10,
              childAspectRatio: 1.1,
            ),
            itemCount: widget.images.length,
            itemBuilder: (context, i) {
              final item = widget.images[i];
              unawaited(_loadImage(item));
              final bytes = _imageBytes[item.id];
              return InkWell(
                onTap: () => setState(() => _expandedImageId = item.id),
                borderRadius: BorderRadius.circular(8),
                child: Ink(
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(8),
                    color: AppColors.line.withValues(alpha: 0.2),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Expanded(
                        child: ClipRRect(
                          borderRadius: const BorderRadius.vertical(top: Radius.circular(8)),
                          child: bytes != null
                              ? Image.memory(bytes, fit: BoxFit.cover)
                              : const Center(
                                  child: SizedBox(
                                    width: 20,
                                    height: 20,
                                    child: CircularProgressIndicator(strokeWidth: 2),
                                  ),
                                ),
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.all(6),
                        child: Text(
                          item.title,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 11),
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ],
        if (widget.videos.isEmpty && widget.images.isEmpty)
          const Padding(
            padding: EdgeInsets.only(top: 24),
            child: Text('暂无素材', style: AppTypography.meta),
          ),
      ],
    );
  }
}
