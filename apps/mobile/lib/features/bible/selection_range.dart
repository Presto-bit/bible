/// 触控词选范围（对齐 Web `selection_range.ts`）。
library;

class WordAnchor {
  const WordAnchor({
    required this.verse,
    required this.start,
    required this.end,
  });
  final int verse;
  final int start;
  final int end;
}

class WordRange {
  const WordRange({required this.anchor, required this.focus});
  final WordAnchor anchor;
  final WordAnchor focus;
}

({List<int> verses, WordAnchor anchor, WordAnchor focus}) normalizeWordRange(
  WordRange range,
) {
  final a = range.anchor;
  final f = range.focus;
  if (a.verse < f.verse || (a.verse == f.verse && a.start <= f.start)) {
    final verses = [for (var i = a.verse; i <= f.verse; i++) i];
    return (verses: verses, anchor: a, focus: f);
  }
  final verses = [for (var i = f.verse; i <= a.verse; i++) i];
  return (verses: verses, anchor: f, focus: a);
}

({List<int> verses, ({int start, int end})? span}) wordRangeToSpan(
  WordRange range,
) {
  final n = normalizeWordRange(range);
  if (n.verses.length == 1) {
    final lo = n.anchor.start < n.focus.start ? n.anchor.start : n.focus.start;
    final hi = n.anchor.end > n.focus.end ? n.anchor.end : n.focus.end;
    return (
      verses: n.verses,
      span: hi > lo ? (start: lo, end: hi) : null,
    );
  }
  return (verses: n.verses, span: null);
}

String textFromWordRange(
  WordRange range,
  String Function(int verse) verseText,
) {
  final n = normalizeWordRange(range);
  final loV = n.anchor.verse;
  final hiV = n.focus.verse;
  final buf = StringBuffer();
  for (final v in n.verses) {
    final text = verseText(v);
    if (loV == hiV) {
      final lo = n.anchor.start < n.focus.start ? n.anchor.start : n.focus.start;
      final hi = n.anchor.end > n.focus.end ? n.anchor.end : n.focus.end;
      buf.write(text.substring(lo.clamp(0, text.length), hi.clamp(0, text.length)));
    } else if (v == loV) {
      buf.write(text.substring(n.anchor.start.clamp(0, text.length)));
    } else if (v == hiV) {
      buf.write(text.substring(0, n.focus.end.clamp(0, text.length)));
    } else {
      buf.write(text);
    }
  }
  return buf.toString();
}

bool wordOverlapsRange(
  int verse,
  int wordStart,
  int wordEnd,
  WordRange range,
) {
  final n = normalizeWordRange(range);
  if (!n.verses.contains(verse)) return false;
  final loV = n.anchor.verse;
  final hiV = n.focus.verse;
  if (loV == hiV) {
    final lo = n.anchor.start < n.focus.start ? n.anchor.start : n.focus.start;
    final hi = n.anchor.end > n.focus.end ? n.anchor.end : n.focus.end;
    return wordStart < hi && wordEnd > lo;
  }
  if (verse == loV) return wordEnd > n.anchor.start;
  if (verse == hiV) return wordStart < n.focus.end;
  return true;
}

WordRange wholeVerseRange(int verse, String text) => WordRange(
      anchor: WordAnchor(verse: verse, start: 0, end: text.length),
      focus: WordAnchor(verse: verse, start: 0, end: text.length),
    );
