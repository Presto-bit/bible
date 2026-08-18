/// 首页 Hero 尺寸，对齐 PWA `.hero-verse`。
library;

import 'package:flutter/widgets.dart';

/// PWA：`min-height: clamp(16.5rem, 60vw, 21.75rem)`（根字号 16px → 264–348）。
///
/// 旧实现用 `62vw` 且按字数一律 +16/+36/+56，典型日课会到 288–308px，
/// 相对「今日推荐」168px 显得过高。现与 PWA 同公式；仅当正文行数
/// 确实撑破下限时才增高（对应 CSS `min-height` 被内容顶开）。
double homeHeroVerseHeight(BuildContext context, {int textLen = 0}) {
  final w = MediaQuery.sizeOf(context).width;
  final base = (w * 0.60).clamp(264.0, 348.0);
  final content = homeHeroVerseContentHeight(textLen);
  return content > base ? content : base;
}

/// 卡片内边距 + 题头 + 出处 + 经文行 + 底栏，不含弹性留白。
double homeHeroVerseContentHeight(int textLen) {
  final lines = homeHeroVerseMaxLines(textLen);
  const padV = 14.0 + 12.0;
  const kicker = 16.0;
  const refBlock = 18.0;
  const afterVerse = 12.0;
  const actions = 36.0;
  return padV +
      kicker +
      refBlock +
      lines * homeHeroVerseFontSize(textLen) * 1.65 +
      afterVerse +
      actions;
}

/// 每日经文与 PWA Hero 一致：固定 16px，不随字数缩小。
double homeHeroVerseFontSize(int textLen) => 16;

/// 最大行数：宁多行展全，不用省略号吃字（全屏壁纸另有完整文）。
int homeHeroVerseMaxLines(int textLen) {
  if (textLen > 110) return 9;
  if (textLen > 80) return 7;
  if (textLen > 50) return 6;
  return 5;
}
