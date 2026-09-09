/// 列表/宣告体排版 catalog（discourse_line_ranges.json）。
library;

enum DiscourseMode { versePerLine, semicolonBreak }

class DiscourseEntry {
  DiscourseEntry({
    required this.ref,
    required this.ranges,
    required this.mode,
    this.kind,
  });

  final String ref;
  final List<(int start, int end)> ranges;
  final DiscourseMode mode;
  final String? kind;

  factory DiscourseEntry.fromJson(Map<String, dynamic> json) {
    final rawRanges = (json['ranges'] as List?) ?? [];
    final ranges = rawRanges
        .map((e) {
          if (e is! List || e.length < 2) return null;
          final a = (e[0] as num?)?.toInt();
          final b = (e[1] as num?)?.toInt();
          if (a == null || b == null) return null;
          return (a, b);
        })
        .whereType<(int, int)>()
        .toList();
    final modeRaw = json['mode'] as String? ?? 'verse_per_line';
    return DiscourseEntry(
      ref: (json['ref'] as String? ?? '').toUpperCase(),
      ranges: ranges,
      mode: modeRaw == 'semicolon_break'
          ? DiscourseMode.semicolonBreak
          : DiscourseMode.versePerLine,
      kind: json['kind'] as String?,
    );
  }
}

String discourseChapterKey(String book, int chapter) =>
    '${book.toUpperCase()}.$chapter';

List<DiscourseEntry> discourseEntriesForChapter(
  List<DiscourseEntry> catalog,
  String book,
  int chapter,
) {
  final key = discourseChapterKey(book, chapter);
  return catalog.where((e) => e.ref == key).toList();
}

bool _inRange(int verse, int start, int end) =>
    verse >= start && verse <= end;

bool isSemicolonBreakVerse(
  List<DiscourseEntry> catalog,
  String book,
  int chapter,
  int verse,
) {
  final entries = discourseEntriesForChapter(catalog, book, chapter);
  return entries.any(
    (e) =>
        e.mode == DiscourseMode.semicolonBreak &&
        e.ranges.any((r) => _inRange(verse, r.$1, r.$2)),
  );
}

List<String> splitSemicolonListLines(String text) {
  if (!text.contains('；')) return [text];
  final parts = text.split('；');
  final out = <String>[];
  for (var i = 0; i < parts.length; i++) {
    final chunk = parts[i];
    if (chunk.isEmpty && i == parts.length - 1) break;
    out.add(i < parts.length - 1 ? '$chunk；' : chunk);
  }
  return out.where((line) => line.isNotEmpty).toList();
}

List<DiscourseEntry> parseDiscourseCatalogJson(List<dynamic> raw) {
  return raw
      .whereType<Map>()
      .map((e) => DiscourseEntry.fromJson(e.cast<String, dynamic>()))
      .where((e) => e.ref.isNotEmpty && e.ranges.isNotEmpty)
      .toList();
}
