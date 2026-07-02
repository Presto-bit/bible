/// 划线锚点 ref 解析（与 Web `mark_ref.ts` 对齐）。
library;

class ParsedMarkRef {
  ParsedMarkRef({
    required this.bookId,
    required this.chapter,
    this.verseStart,
    this.verseEnd,
    this.spanStart,
    this.spanEnd,
    required this.raw,
  });

  final String bookId;
  final int chapter;
  final int? verseStart;
  final int? verseEnd;
  final int? spanStart;
  final int? spanEnd;
  final String raw;
}

ParsedMarkRef? parseMarkRef(String ref) {
  final raw = ref.trim();
  if (raw.isEmpty) return null;
  final partsAt = raw.split('@');
  final base = partsAt.first;
  final parts = base.split('.');
  if (parts.length < 2) return null;
  final bookId = parts[0];
  final chapter = int.tryParse(parts[1]);
  if (bookId.isEmpty || chapter == null) return null;

  int? verseStart;
  int? verseEnd;
  if (parts.length >= 3 && parts[2].isNotEmpty) {
    final tail = parts[2];
    if (tail.contains('-')) {
      final r = tail.split('-');
      verseStart = int.tryParse(r[0]);
      verseEnd = int.tryParse(r.length > 1 ? r[1] : r[0]);
    } else {
      verseStart = int.tryParse(tail);
    }
  }

  int? spanStart;
  int? spanEnd;
  if (partsAt.length > 1) {
    final span = partsAt[1].split('-');
    spanStart = int.tryParse(span[0]);
    spanEnd = int.tryParse(span.length > 1 ? span[1] : span[0]);
  }

  return ParsedMarkRef(
    bookId: bookId,
    chapter: chapter,
    verseStart: verseStart,
    verseEnd: verseEnd,
    spanStart: spanStart,
    spanEnd: spanEnd,
    raw: raw,
  );
}

String syncRef(String ref) => ref.split('@').first;

String selectionRef(
  String bookId,
  int chapter,
  List<int> verses, {
  int? spanStart,
  int? spanEnd,
}) {
  final sel = [...verses]..sort();
  if (sel.isEmpty) return '$bookId.$chapter';
  late String base;
  if (sel.first == sel.last) {
    base = '$bookId.$chapter.${sel.first}';
  } else {
    base = '$bookId.$chapter.${sel.first}-${sel.last}';
  }
  if (spanStart != null &&
      spanEnd != null &&
      sel.length == 1 &&
      spanEnd > spanStart) {
    return '$base@$spanStart-$spanEnd';
  }
  return base;
}

const markColorSemantics = {
  'yellow': '金句',
  'green': '应许',
  'blue': '教导',
  'pink': '疑问',
  'orange': '应用',
};

String markColorLabel(String color) =>
    markColorSemantics[color] ?? '划线';
