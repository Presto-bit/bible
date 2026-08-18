/// 经文 RichText 词跑：idle 合并 TextSpan，芯片只留给词典与选中。
library;

import 'package:flutter/material.dart';

import '../../core/theme.dart';
import 'content_repository.dart';
import 'dictionary_match.dart';
import 'reader_marking_models.dart';
import 'selection_range.dart';
import 'verse_selection_gesture.dart';
import 'verse_words.dart';

/// 词典命中下划线（对齐 PWA `.verse-word.is-dict`）。
TextStyle readerDictSpanStyle(TextStyle base, DictEntity entity) =>
    base.copyWith(
      decoration: TextDecoration.underline,
      decorationStyle: switch (entity.type) {
        'place' => TextDecorationStyle.dashed,
        'person' => TextDecorationStyle.dotted,
        'artifact' => TextDecorationStyle.wavy,
        _ => TextDecorationStyle.dotted,
      },
      decorationColor: (base.color ?? AppColors.ink).withValues(alpha: 0.35),
      decorationThickness: 1.2,
    );

/// 想法虚线（对齐 PWA `.verse-has-thought`）。
TextStyle readerThoughtSpanStyle(
  TextStyle base, {
  required bool hasMyThought,
}) => base.copyWith(
  decoration: TextDecoration.underline,
  decorationStyle: TextDecorationStyle.dashed,
  decorationColor: AppColors.accentDeep.withValues(
    alpha: hasMyThought ? 1 : 0.5,
  ),
  decorationThickness: 1.5,
);

/// 静态词块：与 `SelectableWordChip` 未选中态布局等价。
InlineSpan readerStaticWordSpan(
  String text,
  TextStyle style, {
  WordAnchor? anchor,
  bool isDict = false,
}) {
  if (anchor == null) {
    return TextSpan(
      text: text,
      style: style,
    );
  }
  return WidgetSpan(
    alignment: PlaceholderAlignment.baseline,
    baseline: TextBaseline.alphabetic,
    child: SelectableWordChip(
      anchor: anchor,
      text: text,
      style: style,
      isDict: isDict,
    ),
  );
}

/// 经文间隙：全角敬空 `\u3000`、半角空格改为定宽。
List<InlineSpan> readerGapSpans(
  String gap, {
  required TextStyle baseStyle,
  required double fontPx,
  Color? highlight,
}) {
  if (gap.isEmpty) return const [];
  final out = <InlineSpan>[];
  final buf = StringBuffer();
  void flushText() {
    if (buf.isEmpty) return;
    final t = buf.toString();
    buf.clear();
    out.add(
      TextSpan(
        text: t,
        style: highlight != null
            ? baseStyle.copyWith(backgroundColor: highlight)
            : baseStyle,
      ),
    );
  }

  for (final rune in gap.runes) {
    final ch = String.fromCharCode(rune);
    if (ch == '\u3000' || ch == ' ' || ch == '\u00a0') {
      flushText();
      final w = ch == '\u3000' ? fontPx * 0.42 : fontPx * 0.22;
      out.add(
        WidgetSpan(
          alignment: PlaceholderAlignment.baseline,
          baseline: TextBaseline.alphabetic,
          child: SizedBox(
            width: w,
            height: fontPx,
            child: highlight == null ? null : ColoredBox(color: highlight),
          ),
        ),
      );
    } else {
      buf.write(ch);
    }
  }
  flushText();
  return out;
}

bool _samePaint(TextStyle a, TextStyle b) =>
    a.color == b.color &&
    a.fontSize == b.fontSize &&
    a.backgroundColor == b.backgroundColor &&
    a.decoration == b.decoration &&
    a.decorationStyle == b.decorationStyle &&
    a.decorationColor == b.decorationColor &&
    a.decorationThickness == b.decorationThickness &&
    a.fontWeight == b.fontWeight;

class _MergeBuf {
  final buf = StringBuffer();
  TextStyle? style;
  int? verse;
  int? verseStart;
  final words = <VerseWordSlice>[];

  bool get isEmpty => buf.isEmpty;

  bool canAbsorb({
    required int verse,
    required int start,
    required TextStyle style,
  }) {
    if (isEmpty) return true;
    return this.verse == verse &&
        this.style != null &&
        _samePaint(this.style!, style) &&
        verseStart != null &&
        start == verseStart! + buf.length;
  }

  void add(VerseWordSlice word, TextStyle style, int verse) {
    if (isEmpty) {
      this.style = style;
      this.verse = verse;
      verseStart = word.start;
    }
    buf.write(word.text);
    words.add(word);
  }

  void flush(List<InlineSpan> spans, SpanIndexBuilder index) {
    if (isEmpty) return;
    final text = buf.toString();
    spans.add(TextSpan(text: text, style: style));
    index.text(
      value: text,
      verse: verse!,
      verseStart: verseStart!,
      words: List<VerseWordSlice>.from(words),
    );
    buf.clear();
    words.clear();
    style = null;
    verse = null;
    verseStart = null;
  }
}

/// 把一节的词跑写入 [spans] / [index]。
///
/// idle 无词典、无选中：相邻同款式字符合成 TextSpan（对齐 HTML 可在字边界断行）。
/// 词典与选中仍用芯片，供点按与手柄锚点。
void appendReaderWordSpans({
  required List<InlineSpan> spans,
  required SpanIndexBuilder index,
  required String verseText,
  required int verse,
  required TextStyle baseStyle,
  required double fontPx,
  required List<VerseWordSlice> words,
  required List<DictSpanHit> dictSpans,
  WordRange? wordRange,
  required bool interactive,
  required bool selectionActive,
  VerseMarkInfo? markInfo,
  required bool resumeFlash,
  required bool hasThought,
  required bool hasMyThought,
  Map<String, List<DictEntity>> dictIndex = const {},
  void Function(int verse, int start, int end)? onWordExtend,
  void Function(int verse, String text)? onStart,
  void Function(DictEntity entity, String name, List<DictEntity> candidates)?
  onOpenDict,
}) {
  final mark = markInfo?.mark;
  final merge = _MergeBuf();

  void addGaps(String gap) {
    merge.flush(spans, index);
    final gapSpans = readerGapSpans(
      gap,
      baseStyle: baseStyle,
      fontPx: fontPx,
    );
    spans.addAll(gapSpans);
    index.absorbSpans(gapSpans);
  }

  var cursor = 0;
  for (final w in words) {
    if (w.start > cursor) {
      addGaps(verseText.substring(cursor, w.start));
    }
    final activeWord =
        wordRange != null && wordOverlapsRange(verse, w.start, w.end, wordRange);
    final edge = wordRange != null && activeWord
        ? wordSelectionEdge(verse, w.start, w.end, wordRange)
        : (left: false, right: false);
    final markOnWord =
        mark != null &&
        (markInfo?.spanStart == null ||
            (w.start < (markInfo!.spanEnd ?? 0) &&
                w.end > (markInfo.spanStart ?? 0)));
    var wordStyle = baseStyle;
    if (!activeWord && markOnWord) {
      wordStyle = applyHighlightStyle(baseStyle, mark: mark, disabled: false);
    }
    if (resumeFlash && !activeWord) {
      wordStyle = wordStyle.copyWith(
        backgroundColor: AppColors.accent.withValues(alpha: 0.28),
      );
    }
    if (hasThought && !activeWord) {
      wordStyle = readerThoughtSpanStyle(
        wordStyle,
        hasMyThought: hasMyThought,
      );
    }
    final dictHit = !selectionActive
        ? matchDictSpanAt(w.start, w.end, dictSpans)
        : null;
    if (dictHit != null) {
      wordStyle = readerDictSpanStyle(wordStyle, dictHit.$1);
    }

    final anchor = WordAnchor(verse: verse, start: w.start, end: w.end);
    final needChip = activeWord || dictHit != null;

    if (needChip) {
      merge.flush(spans, index);
      if (interactive) {
        spans.add(
          WidgetSpan(
            alignment: PlaceholderAlignment.baseline,
            baseline: TextBaseline.alphabetic,
            child: SelectableWordChip(
              anchor: anchor,
              text: w.text,
              style: wordStyle,
              selected: activeWord,
              edgeLeft: edge.left,
              edgeRight: edge.right,
              isDict: dictHit != null,
              onTap: selectionActive
                  ? () => onWordExtend?.call(verse, w.start, w.end)
                  : null,
              onDictTap: !selectionActive && dictHit != null
                  ? () => onOpenDict?.call(
                      dictHit.$1,
                      dictHit.$2,
                      dictIndex[dictHit.$2] ?? [dictHit.$1],
                    )
                  : null,
              onDoubleTap: onStart == null
                  ? null
                  : () => onStart(verse, verseText),
            ),
          ),
        );
        index.placeholder(anchor: anchor);
      } else {
        spans.add(TextSpan(text: w.text, style: wordStyle));
        index.text(
          value: w.text,
          verse: verse,
          verseStart: w.start,
          words: [w],
        );
      }
    } else if (!merge.canAbsorb(verse: verse, start: w.start, style: wordStyle)) {
      merge.flush(spans, index);
      merge.add(w, wordStyle, verse);
    } else {
      merge.add(w, wordStyle, verse);
    }
    cursor = w.end;
  }
  if (cursor < verseText.length) {
    addGaps(verseText.substring(cursor));
  }
  merge.flush(spans, index);
}
