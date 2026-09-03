/// 书架默认封面：彼爱品牌图标。
library;

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

class ShelfBrandCover extends StatelessWidget {
  const ShelfBrandCover({super.key});

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: const Color(0xFFFFFCFA),
      child: Center(
        child: SvgPicture.asset(
          'assets/shelf_brand.svg',
          width: 56,
          fit: BoxFit.contain,
        ),
      ),
    );
  }
}
