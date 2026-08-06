/// 经节文本按词切分（对齐 Web `verse_words.ts`，CJK 合并相邻单字）。
library;

class VerseWordSlice {
  const VerseWordSlice({
    required this.text,
    required this.start,
    required this.end,
  });
  final String text;
  final int start;
  final int end;
}

List<VerseWordSlice> sliceVerseWords(String text) {
  if (text.isEmpty) return const [];
  final re = RegExp(
    r'[\u4e00-\u9fff]{1,4}|[A-Za-z0-9]+|[^\s\u4e00-\u9fffA-Za-z0-9]+',
  );
  final out = <VerseWordSlice>[];
  for (final m in re.allMatches(text)) {
    final t = m.group(0)!;
    if (t.trim().isEmpty) continue;
    out.add(VerseWordSlice(text: t, start: m.start, end: m.end));
  }
  return out;
}
