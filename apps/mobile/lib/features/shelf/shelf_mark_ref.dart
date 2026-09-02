/// 书架划线/想法锚点（对齐 Web shelf_mark_ref.ts）
library;

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
