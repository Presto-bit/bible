/// 圣经正文排版契约（对齐 PWA `reader.css` / ReaderView）。
///
/// 金标准：
/// - 散文段首缩进 1em（PWA `.verse-para-start::before { content:'\3000' }`）
/// - 诗体不缩进；行高 2.1；段距 10px
/// - 散文行高 2.05；段距 1.15em（清晨主题）
/// - 页边左右各 16px
/// - 行首节号槽约 1.8em + 0.35em 间距
library;

import 'package:flutter/widgets.dart';

import 'verse_selection_gesture.dart' show SpanIndexBuilder;

/// 散文段首字符（与 PWA `\3000` 同码点；实际占位用 [readerProseIndentSpan] 锁 1em）。
const kProseParagraphIndent = '\u3000';

/// 正文左右边距（对齐 `.container.reader-page { padding: 0 16px }`）。
const kReaderContentPadH = 16.0;

/// 散文行高（清晨/护眼 `.verse-paragraph { line-height: 2.05 }`）。
const kReaderProseLineHeight = 2.05;

/// 诗体行高（`.reader-poetry .verse-paragraph { line-height: 2.1 }`）。
const kReaderPoetryLineHeight = 2.1;

/// 对照栏次行行高（PWA `.reader-parallel-secondary` ≈ 1.55）。
const kReaderParallelSecondaryLineHeight = 1.55;

/// 字距（`letter-spacing: 0.015em`）。
const kReaderLetterSpacingEm = 0.015;

/// 行首节号槽宽（`.verse-no-margin .verse-sup-margin { min-width: 1.8em }`）。
const kReaderMarginVerseSlotEm = 1.8;

/// 行首节号与正文间距（`margin-right: 0.35em`）。
const kReaderMarginVerseGapEm = 0.35;

/// 内嵌节号相对字号（`.verse-sup { font-size: 0.65em }`）。
const kReaderInlineVerseEm = 0.65;

/// 内嵌节号后间隙（≈ `margin-right: 0.25em`）。
const kReaderInlineVerseGapEm = 0.22;

/// 诗体段距（`margin-bottom: 10px`）。
const kReaderPoetryParagraphGap = 10.0;

/// 散文段距系数（清晨 `.reader-prose .verse-paragraph { margin-bottom: 1.15em }`）。
const kReaderProseParagraphGapEm = 1.15;

double readerLineHeight({required bool poetry}) =>
    poetry ? kReaderPoetryLineHeight : kReaderProseLineHeight;

double readerLetterSpacing(double fontPx) => fontPx * kReaderLetterSpacingEm;

double readerParagraphGapBottom({
  required bool poetry,
  required double fontPx,
}) =>
    poetry ? kReaderPoetryParagraphGap : fontPx * kReaderProseParagraphGapEm;

/// 定宽 1em 段首缩进（避免各字体下 `\u3000` 实际宽度漂移）。
InlineSpan readerProseIndentSpan({
  required double fontPx,
  SpanIndexBuilder? index,
}) {
  index?.placeholder();
  return WidgetSpan(
    alignment: PlaceholderAlignment.baseline,
    baseline: TextBaseline.alphabetic,
    child: SizedBox(width: fontPx, height: fontPx * 0.2),
  );
}

TextStyle readerBodyTextStyle({
  required Color color,
  required double fontPx,
  required bool poetry,
  String? fontFamily,
  List<String>? fontFamilyFallback,
}) =>
    TextStyle(
      color: color,
      fontSize: fontPx,
      height: readerLineHeight(poetry: poetry),
      letterSpacing: readerLetterSpacing(fontPx),
      fontFamily: fontFamily,
      fontFamilyFallback: fontFamilyFallback,
    );
