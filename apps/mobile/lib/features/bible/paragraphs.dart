/// 阅读段落边界：CNV 段落表 + 离线兜底算法（对齐 PWA `paragraphs.ts`）。
library;

import 'models.dart';

class VerseParagraph {
  VerseParagraph({
    required this.startVerse,
    required this.endVerse,
    required this.verses,
  });

  final int startVerse;
  final int endVerse;
  final List<Verse> verses;
}

typedef ParagraphRange = (int start, int end);

/// 散文段首缩进（RichText 无 text-indent，1 个全角字宽）。
const kProseParagraphIndent = '\u3000';

const _poetryBooks = {
  'PSA', 'PRO', 'ECC', 'SNG', 'LAM', 'AMO', 'MIC', 'HAB', 'ZEP', 'NAH',
  'HAG', 'ZEC', 'MAL', 'JOB',
};

const _minVerses = 2;
const _maxVerses = 6;
const _maxChars = 320;
const _minWeakVerses = 3;
const _minWeakChars = 120;

bool isPoetryBook(String bookId) =>
    _poetryBooks.contains(bookId.toUpperCase());

bool _endsSentence(String text) {
  final t = text.trim();
  if (t.isEmpty) return false;
  return RegExp('[。！？；….!?;:]["\'\u300d\u300f)]*\$').hasMatch(t);
}

int _charCount(List<Verse> buf) =>
    buf.fold<int>(0, (n, v) => n + v.text.length);

List<ParagraphRange> _mergeSingletonRanges(
  List<ParagraphRange> ranges,
  Map<int, Verse> verseMap,
) {
  if (ranges.length <= 1) return ranges;
  final out = <ParagraphRange>[];
  for (final (start, end) in ranges) {
    if (end - start + 1 > 1 || out.isEmpty) {
      out.add((start, end));
      continue;
    }
    final prev = out.last;
    final combined = prev.$2 - prev.$1 + 2;
    var chars = 0;
    for (var n = prev.$1; n <= end; n++) {
      chars += verseMap[n]?.text.length ?? 0;
    }
    if (combined <= _maxVerses && chars <= _maxChars) {
      out[out.length - 1] = (prev.$1, end);
    } else {
      out.add((start, end));
    }
  }
  return out;
}

List<int> _segmentStarts(List<int> sectionStarts, int first, int last) {
  final starts = sectionStarts.where((s) => s >= first && s <= last).toSet().toList()
    ..sort();
  if (starts.isEmpty || starts.first != first) {
    return [first, ...starts.where((s) => s != first)];
  }
  return starts;
}

List<ParagraphRange> _groupSegment(List<Verse> verses) {
  if (verses.isEmpty) return [];
  final ranges = <ParagraphRange>[];
  var buf = <Verse>[];

  void flush() {
    if (buf.isEmpty) return;
    ranges.add((buf.first.verse, buf.last.verse));
    buf = [];
  }

  for (final v in verses) {
    if (buf.isNotEmpty) {
      if (buf.length >= _maxVerses || _charCount(buf) >= _maxChars) {
        flush();
      } else if (buf.length >= _minWeakVerses &&
          _charCount(buf) >= _minWeakChars &&
          _endsSentence(buf.last.text)) {
        flush();
      }
    }
    buf.add(v);
  }
  flush();

  final verseMap = {for (final v in verses) v.verse: v};
  return _mergeSingletonRanges(ranges, verseMap);
}

/// 离线兜底：sections 小标题 + 合并规则。
List<ParagraphRange> computeParagraphRanges(
  String bookId,
  List<Verse> verses, [
  List<int> sectionStarts = const [],
]) {
  if (verses.isEmpty) return [];
  if (isPoetryBook(bookId)) {
    return verses.map((v) => (v.verse, v.verse)).toList();
  }

  final sorted = [...verses]..sort((a, b) => a.verse.compareTo(b.verse));
  final first = sorted.first.verse;
  final last = sorted.last.verse;
  final starts = _segmentStarts(sectionStarts, first, last);
  final out = <ParagraphRange>[];

  for (var i = 0; i < starts.length; i++) {
    final segStart = starts[i];
    final segEnd = i + 1 < starts.length ? starts[i + 1] - 1 : last;
    final segVerses =
        sorted.where((v) => v.verse >= segStart && v.verse <= segEnd).toList();
    out.addAll(_groupSegment(segVerses));
  }
  return out;
}

List<VerseParagraph> paragraphsFromRanges(
  List<Verse> verses,
  List<ParagraphRange> ranges,
) {
  if (verses.isEmpty || ranges.isEmpty) return [];
  final map = {for (final v in verses) v.verse: v};
  final out = <VerseParagraph>[];
  for (final (start, end) in ranges) {
    final chunk = <Verse>[];
    for (var n = start; n <= end; n++) {
      final v = map[n];
      if (v != null) chunk.add(v);
    }
    if (chunk.isNotEmpty) {
      out.add(VerseParagraph(
        startVerse: chunk.first.verse,
        endVerse: chunk.last.verse,
        verses: chunk,
      ));
    }
  }
  return out;
}

List<VerseParagraph> groupVersesIntoParagraphs(
  String bookId,
  List<Verse> verses, {
  List<int> sectionStarts = const [],
  List<ParagraphRange>? paragraphRanges,
}) {
  if (verses.isEmpty) return [];
  final ranges = (paragraphRanges != null && paragraphRanges.isNotEmpty)
      ? paragraphRanges
      : computeParagraphRanges(bookId, verses, sectionStarts);
  return paragraphsFromRanges(verses, ranges);
}

List<ParagraphRange> parseParagraphRangesJson(List<dynamic> raw) {
  return raw
      .map((e) {
        if (e is! List || e.length < 2) return null;
        final a = (e[0] as num?)?.toInt();
        final b = (e[1] as num?)?.toInt();
        if (a == null || b == null) return null;
        return (a, b);
      })
      .whereType<ParagraphRange>()
      .toList();
}
