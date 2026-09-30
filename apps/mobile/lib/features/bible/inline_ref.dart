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

const _cnFull = <String, String>{
  '创世记': 'GEN',
  '出埃及记': 'EXO',
  '利未记': 'LEV',
  '民数记': 'NUM',
  '申命记': 'DEU',
  '约书亚记': 'JOS',
  '士师记': 'JDG',
  '路得记': 'RUT',
  '撒母耳记上': '1SA',
  '撒母耳记下': '2SA',
  '列王纪上': '1KI',
  '列王纪下': '2KI',
  '历代志上': '1CH',
  '历代志下': '2CH',
  '以斯拉记': 'EZR',
  '尼希米记': 'NEH',
  '以斯帖记': 'EST',
  '约伯记': 'JOB',
  '诗篇': 'PSA',
  '传道书': 'ECC',
  '雅歌': 'SNG',
  '箴言': 'PRO',
  '以赛亚书': 'ISA',
  '耶利米书': 'JER',
  '耶利米哀歌': 'LAM',
  '以西结书': 'EZK',
  '但以理书': 'DAN',
  '何西阿书': 'HOS',
  '约珥书': 'JOL',
  '阿摩司书': 'AMO',
  '俄巴底亚书': 'OBA',
  '约拿书': 'JON',
  '弥迦书': 'MIC',
  '那鸿书': 'NAH',
  '哈巴谷书': 'HAB',
  '西番雅书': 'ZEP',
  '哈该书': 'HAG',
  '撒迦利亚书': 'ZEC',
  '玛拉基书': 'MAL',
  '马太福音': 'MAT',
  '马可福音': 'MRK',
  '路加福音': 'LUK',
  '约翰福音': 'JHN',
  '使徒行传': 'ACT',
  '罗马书': 'ROM',
  '哥林多前书': '1CO',
  '哥林多后书': '2CO',
  '加拉太书': 'GAL',
  '以弗所书': 'EPH',
  '腓立比书': 'PHP',
  '歌罗西书': 'COL',
  '帖撒罗尼迦前书': '1TH',
  '帖撒罗尼迦后书': '2TH',
  '提摩太前书': '1TI',
  '提摩太后书': '2TI',
  '提多书': 'TIT',
  '腓利门书': 'PHM',
  '希伯来书': 'HEB',
  '雅各书': 'JAS',
  '彼得前书': '1PE',
  '彼得后书': '2PE',
  '约翰一书': '1JN',
  '约翰二书': '2JN',
  '约翰三书': '3JN',
  '犹大书': 'JUD',
  '启示录': 'REV',
};

final _cnAll = <String, String>{..._cnFull, ..._cnAbbr};
final _cnNamesSorted = _cnAll.keys.toList()..sort((a, b) => b.length.compareTo(a.length));

final _fwMap = <String, String>{
  '０': '0',
  '１': '1',
  '２': '2',
  '３': '3',
  '４': '4',
  '５': '5',
  '６': '6',
  '７': '7',
  '８': '8',
  '９': '9',
  '：': ':',
  '．': '.',
  '～': '~',
  '－': '-',
  '—': '-',
  '–': '-',
  '‑': '-',
};

final _chapterBlock = RegExp(
  r'第?\s*\d+(?:\s*[-~–—]\s*\d+)?(?:\s*[、，,]\s*第?\d+(?:\s*[-~–—]\s*\d+)?)*\s*[章篇]',
);

String _normalizeRefText(String text) {
  return text.replaceAllMapped(RegExp(r'[０-９：．～－—–‑]'), (m) => _fwMap[m[0]!] ?? m[0]!);
}

String _formatOsis(
  String book,
  String chapter, [
  String? verseStart,
  String? verseEnd,
]) {
  if (verseStart == null || verseStart.isEmpty) return '$book.$chapter';
  if (verseEnd != null && verseEnd.isNotEmpty && verseEnd != verseStart) {
    return '$book.$chapter.$verseStart-$verseEnd';
  }
  return '$book.$chapter.$verseStart';
}

String _osisCrossChapter(String bookId, String ch1, String v1, String ch2, String v2) {
  if (ch1 == ch2) return _formatOsis(bookId, ch1, v1, v2);
  return _formatOsis(bookId, ch1, v1);
}

String? normalizeInlineRef(String raw) {
  final s = _normalizeRefText(raw.trim().replaceAll(RegExp(r'[（）()]'), ''));
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

  for (final name in _cnNamesSorted) {
    if (!s.startsWith(name)) continue;
    final tail = s.substring(name.length).trimLeft();
    final book = _cnAll[name]!;

    final chVerse = RegExp(r'^第?\s*(\d+)章\s*(\d+)\s*(?:至\s*(\d+))?\s*节$').firstMatch(tail);
    if (chVerse != null) {
      return _formatOsis(book, chVerse.group(1)!, chVerse.group(2), chVerse.group(3));
    }
    final cross = RegExp(r'^(\d+)[:：](\d+)\s*[-~–—]\s*(\d+)[:：](\d+)').firstMatch(tail);
    if (cross != null) {
      return _osisCrossChapter(
        book,
        cross.group(1)!,
        cross.group(2)!,
        cross.group(3)!,
        cross.group(4)!,
      );
    }
    final verse = RegExp(r'^(\d+)[:：](\d+)(?:\s*[-~–—]\s*(\d+))?').firstMatch(tail);
    if (verse != null) {
      return _formatOsis(book, verse.group(1)!, verse.group(2), verse.group(3));
    }
    final block = RegExp('^(${_chapterBlock.pattern})').firstMatch(tail);
    if (block != null) {
      final firstCh = RegExp(r'\d+').firstMatch(block.group(1)!)?.group(0);
      if (firstCh != null) return '$book.$firstCh';
    }
    final bare = RegExp(r'^(\d+)\s*[-~–—]\s*(\d+)(?!\s*[:：])').firstMatch(tail);
    if (bare != null) return '$book.${bare.group(1)}';
  }

  final cnMatch = RegExp(
    r'^([\u4e00-\u9fff]{1,4})\s*(\d+)[:：](\d+)(?:\s*[-~–—]\s*(\d+))?$',
  ).firstMatch(s);
  if (cnMatch != null) {
    final book = _cnAll[cnMatch.group(1)!];
    if (book != null) {
      return _formatOsis(book, cnMatch.group(2)!, cnMatch.group(3), cnMatch.group(4));
    }
  }
  return null;
}

class _RefHit {
  const _RefHit({
    required this.start,
    required this.end,
    required this.value,
    required this.osis,
    required this.bookId,
    this.chapter,
  });
  final int start;
  final int end;
  final String value;
  final String osis;
  final String bookId;
  final String? chapter;
}

class _RefContext {
  String? bookId;
  String? chapter;
}

bool _canStartBareRef(String text, int index) {
  if (index == 0) return true;
  final prev = text[index - 1];
  return RegExp(r'[；;，,\s：:、（(）)]').hasMatch(prev);
}

_RefHit? _matchBookRefAt(String text, int index) {
  for (final name in _cnNamesSorted) {
    if (!text.startsWith(name, index)) continue;
    final tail = text.substring(index + name.length);
    final bookId = _cnAll[name]!;

    final chVerse = RegExp(r'^\s*第?\s*(\d+)章\s*(\d+)\s*(?:至\s*(\d+))?\s*节').firstMatch(tail);
    if (chVerse != null) {
      final value = name + chVerse.group(0)!;
      return _RefHit(
        start: index,
        end: index + value.length,
        value: value,
        osis: _formatOsis(bookId, chVerse.group(1)!, chVerse.group(2), chVerse.group(3)),
        bookId: bookId,
        chapter: chVerse.group(1),
      );
    }
    final cross = RegExp(r'^\s*(\d+)[:：](\d+)\s*[-~–—]\s*(\d+)[:：](\d+)').firstMatch(tail);
    if (cross != null) {
      final value = name + cross.group(0)!;
      return _RefHit(
        start: index,
        end: index + value.length,
        value: value,
        osis: _osisCrossChapter(
          bookId,
          cross.group(1)!,
          cross.group(2)!,
          cross.group(3)!,
          cross.group(4)!,
        ),
        bookId: bookId,
        chapter: cross.group(3),
      );
    }
    final verse = RegExp(r'^\s*(\d+)[:：](\d+)(?:\s*[-~–—]\s*(\d+))?').firstMatch(tail);
    if (verse != null) {
      final value = name + verse.group(0)!;
      return _RefHit(
        start: index,
        end: index + value.length,
        value: value,
        osis: _formatOsis(bookId, verse.group(1)!, verse.group(2), verse.group(3)),
        bookId: bookId,
        chapter: verse.group(1),
      );
    }
    final block = RegExp(r'^\s*(' + _chapterBlock.pattern + r')').firstMatch(tail);
    if (block != null) {
      final value = name + block.group(0)!;
      final firstCh = RegExp(r'\d+').firstMatch(block.group(1)!)?.group(0);
      if (firstCh != null) {
        return _RefHit(
          start: index,
          end: index + value.length,
          value: value,
          osis: '$bookId.$firstCh',
          bookId: bookId,
          chapter: firstCh,
        );
      }
    }
    final bare = RegExp(r'^\s*(\d+)\s*[-~–—]\s*(\d+)(?!\s*[:：])').firstMatch(tail);
    if (bare != null) {
      final value = name + bare.group(0)!;
      return _RefHit(
        start: index,
        end: index + value.length,
        value: value,
        osis: '$bookId.${bare.group(1)}',
        bookId: bookId,
        chapter: bare.group(1),
      );
    }
  }

  final en = RegExp(r'^([0-9]?[A-Za-z]{2,4})\s*(\d+)[:：](\d+)(?:\s*[-~–—]\s*(\d+))?')
      .firstMatch(text.substring(index));
  if (en != null) {
    final bookId = en.group(1)!.toUpperCase();
    final value = en.group(0)!;
    return _RefHit(
      start: index,
      end: index + value.length,
      value: value,
      osis: _formatOsis(bookId, en.group(2)!, en.group(3), en.group(4)),
      bookId: bookId,
      chapter: en.group(2),
    );
  }
  return null;
}

_RefHit? _matchContinuationAt(String text, int index, _RefContext ctx) {
  if (ctx.bookId == null || ctx.chapter == null) return null;
  final slice = text.substring(index);

  final andChapter = RegExp(r'^和\s*第?\s*(\d+)\s*[章篇]').firstMatch(slice);
  if (andChapter != null) {
    final value = andChapter.group(0)!;
    return _RefHit(
      start: index,
      end: index + value.length,
      value: value,
      osis: '${ctx.bookId}.${andChapter.group(1)}',
      bookId: ctx.bookId!,
      chapter: andChapter.group(1),
    );
  }
  final commaVerse = RegExp(r'^,\s*(\d+)').firstMatch(slice);
  if (commaVerse != null) {
    final value = commaVerse.group(0)!;
    return _RefHit(
      start: index,
      end: index + value.length,
      value: value,
      osis: _formatOsis(ctx.bookId!, ctx.chapter!, commaVerse.group(1)),
      bookId: ctx.bookId!,
      chapter: ctx.chapter,
    );
  }
  final enumRange = RegExp(r'^、(\d+)(?:\s*[-~–—]\s*(\d+))?').firstMatch(slice);
  if (enumRange != null) {
    final value = enumRange.group(0)!;
    return _RefHit(
      start: index,
      end: index + value.length,
      value: value,
      osis: _formatOsis(ctx.bookId!, ctx.chapter!, enumRange.group(1), enumRange.group(2)),
      bookId: ctx.bookId!,
      chapter: ctx.chapter,
    );
  }
  return null;
}

_RefHit? _matchBareRefAt(String text, int index, _RefContext ctx) {
  if (ctx.bookId == null || !_canStartBareRef(text, index)) return null;
  final slice = text.substring(index);

  final block = RegExp('^(${_chapterBlock.pattern})').firstMatch(slice);
  if (block != null) {
    final firstCh = RegExp(r'\d+').firstMatch(block.group(1)!)?.group(0);
    if (firstCh != null) {
      return _RefHit(
        start: index,
        end: index + block.group(0)!.length,
        value: block.group(0)!,
        osis: '${ctx.bookId}.$firstCh',
        bookId: ctx.bookId!,
        chapter: firstCh,
      );
    }
  }

  final cross = RegExp(r'^(\d+)[:：](\d+)\s*[-~–—]\s*(\d+)[:：](\d+)').firstMatch(slice);
  if (cross != null) {
    final value = cross.group(0)!;
    return _RefHit(
      start: index,
      end: index + value.length,
      value: value,
      osis: _osisCrossChapter(
        ctx.bookId!,
        cross.group(1)!,
        cross.group(2)!,
        cross.group(3)!,
        cross.group(4)!,
      ),
      bookId: ctx.bookId!,
      chapter: cross.group(3),
    );
  }
  final m = RegExp(r'^(\d+)[:：](\d+)(?:\s*[-~–—]\s*(\d+))?').firstMatch(slice);
  if (m == null) return null;
  final value = m.group(0)!;
  return _RefHit(
    start: index,
    end: index + value.length,
    value: value,
    osis: _formatOsis(ctx.bookId!, m.group(1)!, m.group(2), m.group(3)),
    bookId: ctx.bookId!,
    chapter: m.group(1),
  );
}

List<InlineRefPart> splitInlineRefs(String text) {
  final normalized = _normalizeRefText(text);
  final hits = <_RefHit>[];
  final ctx = _RefContext();
  var i = 0;
  while (i < normalized.length) {
    final bookHit = _matchBookRefAt(normalized, i);
    if (bookHit != null) {
      hits.add(bookHit);
      ctx.bookId = bookHit.bookId;
      ctx.chapter = bookHit.chapter;
      i = bookHit.end;
      continue;
    }
    if (ctx.bookId != null) {
      final cont = _matchContinuationAt(normalized, i, ctx);
      if (cont != null) {
        hits.add(cont);
        i = cont.end;
        continue;
      }
      final bare = _matchBareRefAt(normalized, i, ctx);
      if (bare != null) {
        hits.add(bare);
        ctx.chapter = bare.chapter ?? ctx.chapter;
        i = bare.end;
        continue;
      }
    }
    i += 1;
  }

  if (hits.isEmpty) return [InlineRefPart.text(text)];

  final parts = <InlineRefPart>[];
  var last = 0;
  for (final hit in hits) {
    if (hit.start > last) {
      parts.add(InlineRefPart.text(text.substring(last, hit.start)));
    }
    parts.add(InlineRefPart.ref(text.substring(hit.start, hit.end), hit.osis));
    last = hit.end;
  }
  if (last < text.length) {
    parts.add(InlineRefPart.text(text.substring(last)));
  }
  return parts;
}
