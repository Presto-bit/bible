/// 经文数据模型（对齐后端 /bible/* 响应）。
library;

class BibleBook {
  BibleBook({
    required this.id,
    required this.name,
    required this.testament,
    required this.sortOrder,
    required this.chapterCount,
  });

  final String id;
  final String name;
  final String testament; // OT / NT
  final int sortOrder;
  final int chapterCount;

  bool get isOldTestament => testament.toUpperCase().startsWith('O');

  factory BibleBook.fromJson(Map<String, dynamic> j) => BibleBook(
        id: j['id'] as String,
        name: j['name'] as String,
        testament: (j['testament'] ?? '') as String,
        sortOrder: (j['sort_order'] ?? 0) as int,
        chapterCount: (j['chapter_count'] ?? 0) as int,
      );
}

class Verse {
  Verse({required this.verse, required this.text});
  final int verse;
  final String text;

  factory Verse.fromJson(Map<String, dynamic> j) =>
      Verse(verse: j['verse'] as int, text: (j['text'] ?? '') as String);
}

class Chapter {
  Chapter({
    required this.bookId,
    required this.bookName,
    required this.chapter,
    required this.verses,
  });

  final String bookId;
  final String bookName;
  final int chapter;
  final List<Verse> verses;

  factory Chapter.fromJson(Map<String, dynamic> j) => Chapter(
        bookId: j['book'] as String,
        bookName: (j['name'] ?? '') as String,
        chapter: j['chapter'] as int,
        verses: ((j['verses'] ?? []) as List)
            .map((e) => Verse.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}
