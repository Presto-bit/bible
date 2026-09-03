/// 书架默认封面：彼爱 App 红底官方图标。
library;

import 'package:flutter/material.dart';

/// 与 Web `PWA_SPLASH_BG_COLOR` / 根目录 icon.png 一致。
const shelfBrandCoverBg = Color(0xFFE32626);

class ShelfBrandCover extends StatelessWidget {
  const ShelfBrandCover({super.key});

  @override
  Widget build(BuildContext context) {
    return const ColoredBox(
      color: shelfBrandCoverBg,
      child: Image(
        image: AssetImage('assets/app_icon_shelf.png'),
        fit: BoxFit.cover,
        gaplessPlayback: true,
        errorBuilder: (_, __, ___) => Center(
          child: Icon(Icons.menu_book_outlined, color: Colors.white.withValues(alpha: 0.9), size: 40),
        ),
      ),
    );
  }
}
