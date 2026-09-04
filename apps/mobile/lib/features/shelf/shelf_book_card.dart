/// 书架书卡：单卡片上图下书名 + 封面底进度细线。
library;

import 'package:flutter/material.dart';

import '../../core/theme.dart';
import 'shelf_brand_cover.dart';
import 'shelf_repository.dart';

class ShelfBookCard extends StatelessWidget {
  const ShelfBookCard({
    super.key,
    required this.book,
    this.coverUrl,
    this.progressRatio,
    this.onTap,
    this.onDetailTap,
    this.onLongPress,
  });

  final ShelfBookSummary book;
  final String? coverUrl;
  final double? progressRatio;
  final VoidCallback? onTap;
  final VoidCallback? onDetailTap;
  final VoidCallback? onLongPress;

  @override
  Widget build(BuildContext context) {
    final ratio = progressRatio?.clamp(0.0, 1.0);
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        onLongPress: onLongPress,
        borderRadius: BorderRadius.circular(6),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(6),
                child: DecoratedBox(
                  decoration: const BoxDecoration(
                    boxShadow: [
                      BoxShadow(
                        color: Color(0x14000000),
                        blurRadius: 8,
                        offset: Offset(0, 2),
                      ),
                    ],
                  ),
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      if (coverUrl != null && coverUrl!.isNotEmpty)
                        Image.network(coverUrl!, fit: BoxFit.cover)
                      else
                        const ShelfBrandCover(),
                      if (ratio != null && ratio > 0)
                        Positioned(
                          left: 0,
                          right: 0,
                          bottom: 0,
                          child: SizedBox(
                            height: 2,
                            child: ColoredBox(
                              color: AppColors.ink.withValues(alpha: 0.08),
                              child: Align(
                                alignment: Alignment.centerLeft,
                                child: FractionallySizedBox(
                                  widthFactor: ratio,
                                  child: const ColoredBox(
                                    color: AppColors.accentDeep,
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                      if (onDetailTap != null)
                        Positioned(
                          top: 5,
                          right: 5,
                          child: Material(
                            color: Colors.black38,
                            shape: const CircleBorder(),
                            clipBehavior: Clip.antiAlias,
                            child: InkWell(
                              onTap: onDetailTap,
                              customBorder: const CircleBorder(),
                              child: const SizedBox(
                                width: 28,
                                height: 28,
                                child: Center(
                                  child: Text(
                                    'i',
                                    style: TextStyle(
                                      color: Colors.white,
                                      fontSize: 13,
                                      fontWeight: FontWeight.w600,
                                      fontStyle: FontStyle.italic,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(height: 6),
            SizedBox(
              height: 32,
              child: Text(
                book.title,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 12,
                  height: 1.35,
                  fontWeight: FontWeight.w500,
                  color: AppColors.ink,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
