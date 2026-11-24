/// 经卷目录网格（方案 B：简称 + 副行，固定字号单行省略）。
library;

import 'package:flutter/material.dart';

import '../../core/theme.dart';
import 'bible_book_names.dart';
import 'models.dart';

/// 弹层与全屏目录共用的经卷格。
class CatalogBookGrid extends StatelessWidget {
  const CatalogBookGrid({
    super.key,
    required this.books,
    required this.selectedId,
    required this.onPick,
    this.englishUI = false,
    this.compactRadius = false,
    this.crossAxisCount = 4,
  });

  final List<BibleBook> books;
  final String selectedId;
  final void Function(BibleBook) onPick;
  final bool englishUI;

  /// 弹层用 12px 圆角；全屏目录用 12（默认与 [compactRadius] false 一致）。
  final bool compactRadius;

  /// 顶栏弹层 5 列；全屏目录默认 4 列。
  final int crossAxisCount;

  @override
  Widget build(BuildContext context) {
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: books.length,
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: crossAxisCount,
        mainAxisSpacing: 8,
        crossAxisSpacing: 8,
        childAspectRatio: crossAxisCount >= 5 ? 0.88 : 0.92,
      ),
      itemBuilder: (_, i) {
        final b = books[i];
        final active = b.id == selectedId;
        final radius = compactRadius ? 10.0 : 12.0;
        return Material(
          color: active ? AppColors.goldWash : AppColors.surfaceSunken,
          borderRadius: BorderRadius.circular(radius),
          child: InkWell(
            onTap: () => onPick(b),
            borderRadius: BorderRadius.circular(radius),
            child: Padding(
              padding: const EdgeInsets.all(8),
              child: CatalogBookCellLabels(
                bookId: b.id,
                name: b.name,
                englishUI: englishUI,
                active: active,
              ),
            ),
          ),
        );
      },
    );
  }
}

class CatalogBookCellLabels extends StatelessWidget {
  const CatalogBookCellLabels({
    super.key,
    required this.bookId,
    required this.name,
    this.englishUI = false,
    this.active = false,
  });

  final String bookId;
  final String name;
  final bool englishUI;
  final bool active;

  @override
  Widget build(BuildContext context) {
    final abbr = bibleBookAbbrFor(bookId, name, english: englishUI);
    final subline = catalogBookSublineFor(bookId, name, english: englishUI);
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Text(
          abbr,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w700,
            color: active ? AppColors.accentDeep : AppColors.ink,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          subline,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontSize: 10,
            color: AppColors.inkFaint,
          ),
        ),
      ],
    );
  }
}