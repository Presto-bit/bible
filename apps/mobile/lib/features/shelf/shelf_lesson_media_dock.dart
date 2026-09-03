/// 教案素材顶栏（对齐 Web ShelfLessonMediaDock）。
library;

import 'package:flutter/material.dart';

import '../../core/theme.dart';
import 'shelf_repository.dart';

class ShelfLessonMediaDock extends StatelessWidget {
  const ShelfLessonMediaDock({
    super.key,
    required this.videos,
    required this.images,
    required this.audios,
    required this.onOpenAll,
    this.onOpenVideo,
  });

  final List<ShelfAttachment> videos;
  final List<ShelfAttachment> images;
  final List<ShelfAttachment> audios;
  final VoidCallback onOpenAll;
  final ValueChanged<ShelfAttachment>? onOpenVideo;

  @override
  Widget build(BuildContext context) {
    final total = videos.length + images.length + audios.length;
    if (total == 0) return const SizedBox.shrink();

    final summary = videos.isNotEmpty && images.isEmpty && audios.isEmpty
        ? '${videos.length} 个视频'
        : images.isNotEmpty && videos.isEmpty && audios.isEmpty
            ? '${images.length} 张图片'
            : '$total 项素材';

    return Material(
      color: AppColors.paper.withValues(alpha: 0.96),
      child: Container(
        decoration: BoxDecoration(
          border: Border(bottom: BorderSide(color: AppColors.line.withValues(alpha: 0.6))),
        ),
        padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
        child: Row(
          children: [
            TextButton(
              style: TextButton.styleFrom(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                minimumSize: const Size(0, 44),
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                  side: BorderSide(color: AppColors.line.withValues(alpha: 0.8)),
                ),
              ),
              onPressed: onOpenAll,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('本课素材', style: AppTypography.meta.copyWith(fontWeight: FontWeight.w600)),
                  Text(summary, style: AppTypography.meta.copyWith(fontSize: 11)),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    for (final item in videos)
                      _DockChip(
                        icon: Icons.play_arrow_rounded,
                        label: item.title,
                        onTap: () {
                          if (onOpenVideo != null) {
                            onOpenVideo!(item);
                          } else {
                            onOpenAll();
                          }
                        },
                      ),
                    for (final item in audios)
                      _DockChip(
                        icon: Icons.audiotrack_outlined,
                        label: item.title,
                        onTap: onOpenAll,
                      ),
                    for (final item in images)
                      _DockChip(
                        icon: Icons.image_outlined,
                        label: item.title,
                        onTap: onOpenAll,
                      ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DockChip extends StatelessWidget {
  const _DockChip({required this.icon, required this.label, required this.onTap});

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 6),
      child: ActionChip(
        avatar: Icon(icon, size: 16, color: AppColors.ink),
        label: Text(label, overflow: TextOverflow.ellipsis),
        onPressed: onTap,
        materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
        visualDensity: VisualDensity.compact,
      ),
    );
  }
}
