/// 书架书卡：铺满格子 + GestureDetector.onTap（与滚动同竞技场，避开 Listener 被 cancel）。
library;

import 'package:flutter/material.dart';

import '../../core/theme.dart';
import 'shelf_brand_cover.dart';
import 'shelf_repository.dart';

/// 对齐 PWA `.shelf-book-card-cover { aspect-ratio: 3 / 4 }`
const _kCoverAspect = 3 / 4;

/// 标题区固定高：两行书名，或一行书名 + 合集 meta（避免挤占封面高度）
const _kTitleBlockHeight = 48.0;

class ShelfBookCard extends StatelessWidget {
  const ShelfBookCard({
    super.key,
    required this.book,
    this.coverUrl,
    this.progressRatio,
    this.onTap,
    this.onLongPress,
  });

  final ShelfBookSummary book;
  final String? coverUrl;
  final double? progressRatio;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;

  @override
  Widget build(BuildContext context) {
    final ratio = progressRatio?.clamp(0.0, 1.0);
    final resolvedCover = (coverUrl ?? '').trim();
    final isCollection = book.bookType == 'collection';
    final metaLine = isCollection
        ? '合集 · ${book.sectionCount} 份'
        : (book.author.isNotEmpty
            ? book.author
            : (book.subtitle.isNotEmpty ? book.subtitle : null));
    final hasMeta = metaLine != null && metaLine.isNotEmpty;

    // 格子约束是 tight：必须 expand，否则空白区无命中、滚动易吞掉子树
    return Material(
      color: Colors.transparent,
      child: SizedBox.expand(
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: onTap,
          onLongPress: onLongPress,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              AspectRatio(
                aspectRatio: _kCoverAspect,
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(6),
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      const ColoredBox(color: shelfBrandCoverBg),
                      if (resolvedCover.isNotEmpty)
                        Image.network(
                          resolvedCover,
                          fit: BoxFit.cover,
                          gaplessPlayback: true,
                          errorBuilder: (_, __, ___) => const ShelfBrandCover(),
                        )
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
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 6),
              SizedBox(
                height: _kTitleBlockHeight,
                child: ClipRect(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        book.title.isEmpty ? '未命名' : book.title,
                        maxLines: hasMeta ? 1 : 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 12,
                          height: 1.35,
                          fontWeight: FontWeight.w500,
                          color: AppColors.ink,
                        ),
                      ),
                      if (hasMeta)
                        Text(
                          metaLine,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 11,
                            height: 1.3,
                            color: AppColors.ink.withValues(alpha: 0.55),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
