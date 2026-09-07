import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:presto_bible/features/bible/reader_typography.dart';

/// 与 PWA `reader.css` 排版契约对齐，防回归。
void main() {
  group('reader_typography contract', () {
    test('indent is one ideographic space / 1em lock', () {
      expect(kProseParagraphIndent, '\u3000');
      final span = readerProseIndentSpan(fontPx: 18);
      expect(span, isA<WidgetSpan>());
      final box = (span as WidgetSpan).child;
      expect(box, isA<SizedBox>());
      expect((box as SizedBox).width, 18);
    });

    test('line heights match PWA morning/poetry', () {
      expect(readerLineHeight(poetry: false), 2.05);
      expect(readerLineHeight(poetry: true), 2.1);
      expect(kReaderParallelSecondaryLineHeight, 1.55);
    });

    test('paragraph gaps match PWA', () {
      expect(readerParagraphGapBottom(poetry: true, fontPx: 18), 10);
      expect(readerParagraphGapBottom(poetry: false, fontPx: 18), 18 * 1.15);
      expect(readerParagraphGapBottom(poetry: false, fontPx: 20), 20 * 1.15);
    });

    test('content pad and margin verse slot', () {
      expect(kReaderContentPadH, 16);
      expect(kReaderMarginVerseSlotEm, 1.8);
      expect(kReaderMarginVerseGapEm, 0.35);
      expect(kReaderLetterSpacingEm, 0.015);
      expect(readerLetterSpacing(18), closeTo(0.27, 1e-9));
    });
  });
}
