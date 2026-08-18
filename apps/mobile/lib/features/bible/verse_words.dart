/// 经节文本按词切分（对齐 PWA `verse_words.ts`）。
///
/// 中文 1–4 字一块：选区是连续蓝带而不是逐字色块，节点也更少、竖滑更跟手。
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

/// [splitOffsets] 可传入词典命中的起止位置，把原始 CJK 词块切到词典边界。
///
/// 例如 `但耶稣` 的词典命中为 `耶稣` 时，拆成 `但` / `耶稣`，避免整块
/// `但耶稣` 被当作词典链接并错误划线。
List<VerseWordSlice> sliceVerseWords(
  String text, {
  Iterable<int> splitOffsets = const [],
}) {
  if (text.isEmpty) return const [];
  final re = RegExp(
    r'[\u4e00-\u9fff]{1,4}|[A-Za-z0-9]+|[^\s\u4e00-\u9fffA-Za-z0-9]+',
  );
  final out = <VerseWordSlice>[];
  final splitSet = splitOffsets
      .where((offset) => offset > 0 && offset < text.length)
      .toSet();
  for (final m in re.allMatches(text)) {
    final t = m.group(0)!;
    if (t.trim().isEmpty) continue;
    final cuts =
        splitSet.where((offset) => offset > m.start && offset < m.end).toList()
          ..sort();
    var start = m.start;
    for (final end in [...cuts, m.end]) {
      out.add(
        VerseWordSlice(
          text: text.substring(start, end),
          start: start,
          end: end,
        ),
      );
      start = end;
    }
  }
  return out;
}
