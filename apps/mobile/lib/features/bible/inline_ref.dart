/// 段落标题中的经节引用解析（对齐 Web `inline_ref.ts`）。
library;

class InlineRefPart {
  const InlineRefPart.text(this.value)
      : kind = InlineRefKind.text,
        osis = null;
  const InlineRefPart.ref(this.value, this.osis) : kind = InlineRefKind.ref;

  final InlineRefKind kind;
  final String value;
  final String? osis;
}

enum InlineRefKind { text, ref }

const _cnAbbr = <String, String>{
  '创': 'GEN',
  '出': 'EXO',
  '利': 'LEV',
  '民': 'NUM',
  '申': 'DEU',
  '书': 'JOS',
  '士': 'JDG',
  '得': 'RUT',
  '撒上': '1SA',
  '撒下': '2SA',
  '王上': '1KI',
  '王下': '2KI',
  '代上': '1CH',
  '代下': '2CH',
  '拉': 'EZR',
  '尼': 'NEH',
  '斯': 'EST',
  '伯': 'JOB',
  '诗': 'PSA',
  '箴': 'PRO',
  '传': 'ECC',
  '歌': 'SNG',
  '赛': 'ISA',
  '耶': 'JER',
  '哀': 'LAM',
  '结': 'EZK',
  '但': 'DAN',
  '何': 'HOS',
  '珥': 'JOL',
  '摩': 'AMO',
  '俄': 'OBA',
  '拿': 'JON',
  '弥': 'MIC',
  '鸿': 'NAH',
  '哈': 'HAB',
  '番': 'ZEP',
  '该': 'HAG',
  '亚': 'ZEC',
  '玛': 'MAL',
  '太': 'MAT',
  '可': 'MRK',
  '路': 'LUK',
  '约': 'JHN',
  '徒': 'ACT',
  '罗': 'ROM',
  '林前': '1CO',
  '林后': '2CO',
  '加': 'GAL',
  '弗': 'EPH',
  '腓': 'PHP',
  '西': 'COL',
  '帖前': '1TH',
  '帖后': '2TH',
  '提前': '1TI',
  '提后': '2TI',
  '多': 'TIT',
  '门': 'PHM',
  '来': 'HEB',
  '雅': 'JAS',
  '彼前': '1PE',
  '彼后': '2PE',
  '约一': '1JN',
  '约二': '2JN',
  '约三': '3JN',
  '犹': 'JUD',
  '启': 'REV',
};

final _refInText = RegExp(
  r'(?:[（(])?((?:[A-Za-z0-9]{2,4}|[\u4e00-\u9fff]{1,3})\s*\d+[:：.\s]\d+(?:\s*[-~–]\s*\d+)?|[\u4e00-\u9fff]{2,6}\d+[:：]\d+(?:-\d+)?)(?:[）)])?',
);

String _formatOsis(
  String book,
  String chapter, [
  String? verseStart,
  String? verseEnd,
]) {
  if (verseStart == null || verseStart.isEmpty) return '$book.$chapter';
  if (verseEnd != null &&
      verseEnd.isNotEmpty &&
      verseEnd != verseStart) {
    return '$book.$chapter.$verseStart-$verseEnd';
  }
  return '$book.$chapter.$verseStart';
}

String? normalizeInlineRef(String raw) {
  final s = raw.trim().replaceAll(RegExp(r'[（）()]'), '');
  if (s.isEmpty) return null;

  final osisMatch = RegExp(
    r'^([A-Za-z0-9]+)[.\s]+(\d+)(?:[:.\s]+(\d+)(?:\s*[-~–—]\s*(\d+))?)?',
  ).firstMatch(s);
  if (osisMatch != null) {
    return _formatOsis(
      osisMatch.group(1)!.toUpperCase(),
      osisMatch.group(2)!,
      osisMatch.group(3),
      osisMatch.group(4),
    );
  }

  final cnMatch = RegExp(
    r'^([\u4e00-\u9fff]{1,3})(\d+)[:：](\d+)(?:\s*[-~–—]\s*(\d+))?',
  ).firstMatch(s);
  if (cnMatch != null) {
    final book = _cnAbbr[cnMatch.group(1)!];
    if (book != null) {
      return _formatOsis(
        book,
        cnMatch.group(2)!,
        cnMatch.group(3),
        cnMatch.group(4),
      );
    }
  }

  final cnChOnly = RegExp(r'^([\u4e00-\u9fff]{1,3})(\d+)章?$').firstMatch(s);
  if (cnChOnly != null) {
    final book = _cnAbbr[cnChOnly.group(1)!];
    if (book != null) return '${book}.${cnChOnly.group(2)}';
  }
  return null;
}

List<InlineRefPart> splitInlineRefs(String text) {
  final parts = <InlineRefPart>[];
  var last = 0;
  for (final m in _refInText.allMatches(text)) {
    if (m.start > last) {
      parts.add(InlineRefPart.text(text.substring(last, m.start)));
    }
    final value = m.group(0)!;
    parts.add(InlineRefPart.ref(value, normalizeInlineRef(value)));
    last = m.end;
  }
  if (last < text.length) {
    parts.add(InlineRefPart.text(text.substring(last)));
  }
  return parts.isEmpty ? [InlineRefPart.text(text)] : parts;
}
