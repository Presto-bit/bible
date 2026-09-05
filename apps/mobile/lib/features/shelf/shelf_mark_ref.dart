/// 书架划线/想法锚点（对齐 Web shelf_mark_ref.ts）
library;

class ShelfMarkRefParsed {
  const ShelfMarkRefParsed({
    required this.bookId,
    required this.sectionId,
    required this.pageIndex,
    this.spanStart,
    this.spanEnd,
  });

  final String bookId;
  final String sectionId;
  final int pageIndex;
  final int? spanStart;
  final int? spanEnd;
}

String buildShelfMarkRef(
  String bookId,
  String sectionId, {
  int pageIndex = 0,
  int? spanStart,
  int? spanEnd,
}) {
  final base = 'SHELF.$bookId.$sectionId.p${pageIndex.clamp(0, 9999)}';
  if (spanStart != null && spanEnd != null && spanEnd > spanStart) {
    return '$base@$spanStart-$spanEnd';
  }
  return base;
}

ShelfMarkRefParsed? parseShelfMarkRef(String? ref) {
  if (ref == null || !ref.startsWith('SHELF.')) return null;
  var rest = ref.substring(6);
  int? spanStart;
  int? spanEnd;
  final at = rest.lastIndexOf('@');
  if (at >= 0) {
    final span = rest.substring(at + 1);
    rest = rest.substring(0, at);
    final parts = span.split('-');
    if (parts.length == 2) {
      spanStart = int.tryParse(parts[0]);
      spanEnd = int.tryParse(parts[1]);
    }
  }
  var pageIndex = 0;
  final pageMatch = RegExp(r'\.p(\d+)$').firstMatch(rest);
  if (pageMatch != null) {
    pageIndex = int.tryParse(pageMatch.group(1)!) ?? 0;
    rest = rest.substring(0, pageMatch.start);
  }
  final dot = rest.lastIndexOf('.');
  if (dot <= 0 || dot >= rest.length - 1) return null;
  return ShelfMarkRefParsed(
    bookId: rest.substring(0, dot),
    sectionId: rest.substring(dot + 1),
    pageIndex: pageIndex,
    spanStart: spanStart,
    spanEnd: spanEnd,
  );
}

String formatShelfMarkRefLabel(String ref) {
  final p = parseShelfMarkRef(ref);
  if (p == null) return '选中文字';
  if (p.spanStart != null && p.spanEnd != null) {
    return '选中片段 · ${p.spanEnd! - p.spanStart!} 字';
  }
  return '本节笔记';
}

int? findPlainTextSpan(String html, String selected) {
  final text = _stripHtml(html);
  final needle = selected.trim();
  if (needle.isEmpty) return null;
  final start = text.indexOf(needle);
  if (start < 0) return null;
  return start;
}

String _stripHtml(String html) {
  return html
      .replaceAll(RegExp(r'<[^>]+>'), '')
      .replaceAll('&nbsp;', ' ')
      .replaceAll('&amp;', '&')
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim();
}

String plainTextFromHtml(String html) => _stripHtml(html);
