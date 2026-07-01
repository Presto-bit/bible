/// 段落分组：对齐微读——散文多节合并为一段，诗体逐节。
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

const _poetryBooks = {
  'PSA', 'PRO', 'ECC', 'SNG', 'LAM', 'AMO', 'MIC', 'HAB', 'ZEP', 'NAH',
  'HAG', 'ZEC', 'MAL', 'JOB',
};

bool _endsSentence(String text) {
  final t = text.trim();
  if (t.isEmpty) return false;
  final last = t[t.length - 1];
  return '。！？；…'.contains(last) || '.!?;:'.contains(last);
}

List<VerseParagraph> groupVersesIntoParagraphs(
  String bookId,
  List<Verse> verses, [
  List<int> sectionStarts = const [],
]) {
  if (verses.isEmpty) return [];
  final sections = sectionStarts.toSet();
  final poetry = _poetryBooks.contains(bookId.toUpperCase());

  if (poetry) {
    return verses
        .map((v) => VerseParagraph(startVerse: v.verse, endVerse: v.verse, verses: [v]))
        .toList();
  }

  final out = <VerseParagraph>[];
  var buf = <Verse>[];

  void flush() {
    if (buf.isEmpty) return;
    out.add(VerseParagraph(
      startVerse: buf.first.verse,
      endVerse: buf.last.verse,
      verses: List.of(buf),
    ));
    buf = [];
  }

  for (final v in verses) {
    if (sections.contains(v.verse) && buf.isNotEmpty) flush();
    if (buf.isNotEmpty) {
      final prev = buf.last;
      final breakHere = _endsSentence(prev.text) ||
          buf.length >= 5 ||
          (buf.length >= 3 && prev.text.length > 40 && _endsSentence(prev.text));
      if (breakHere) flush();
    }
    buf.add(v);
  }
  flush();
  return out;
}
