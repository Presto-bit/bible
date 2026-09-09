/// 诗体平行行/阶梯体（poetry_lines.json，§7.3）。
library;

String poetryVerseKey(String book, int chapter, int verse) =>
    '${book.toUpperCase()}.$chapter.$verse';

class PoetryLinesIndex {
  PoetryLinesIndex(this.verses);

  final Map<String, List<String>> verses;

  List<String>? linesFor(String book, int chapter, int verse) {
    final lines = verses[poetryVerseKey(book, chapter, verse)];
    if (lines == null || lines.isEmpty) return null;
    return lines;
  }

  factory PoetryLinesIndex.fromJson(Map<String, dynamic> json) {
    final raw = (json['verses'] as Map?)?.cast<String, dynamic>() ?? {};
    final verses = <String, List<String>>{};
    for (final entry in raw.entries) {
      final list = (entry.value as List?)?.map((e) => e.toString()).toList() ?? [];
      if (list.length > 1) {
        verses[entry.key.toUpperCase()] = list;
      }
    }
    return PoetryLinesIndex(verses);
  }
}
