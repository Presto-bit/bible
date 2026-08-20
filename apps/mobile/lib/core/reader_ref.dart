/// 从经文 ref 解析读经跳转（对齐 Web `readerHrefFromRef`）。
library;

class ReaderRefJump {
  const ReaderRefJump({required this.book, required this.chapter, this.verse});

  final String book;
  final int chapter;
  final int? verse;
}

ReaderRefJump? readerJumpFromRef(String ref) {
  final r = ref.trim();
  if (r.isEmpty || r == 'FREE' || r == '小爱的解读') return null;

  final span = RegExp(r'^([A-Za-z0-9]+)\.(\d+)-([A-Za-z0-9]+)\.(\d+)$').firstMatch(r);
  if (span != null &&
      span.group(1)!.toUpperCase() == span.group(3)!.toUpperCase()) {
    return ReaderRefJump(
      book: span.group(1)!.toUpperCase(),
      chapter: int.tryParse(span.group(2)!) ?? 1,
    );
  }

  final verseRange =
      RegExp(r'^([A-Za-z0-9]+)\.(\d+)\.(\d+)-(\d+)$').firstMatch(r);
  if (verseRange != null) {
    return ReaderRefJump(
      book: verseRange.group(1)!.toUpperCase(),
      chapter: int.tryParse(verseRange.group(2)!) ?? 1,
      verse: int.tryParse(verseRange.group(3)!),
    );
  }

  final m = RegExp(r'^([A-Za-z0-9]+)\.(\d+)(?:\.(\d+))?$').firstMatch(r);
  if (m == null) return null;
  return ReaderRefJump(
    book: m.group(1)!.toUpperCase(),
    chapter: int.tryParse(m.group(2)!) ?? 1,
    verse: m.group(3) != null ? int.tryParse(m.group(3)!) : null,
  );
}
