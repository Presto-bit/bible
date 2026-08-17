/// 词典正文匹配：对齐 Web `dictionary_match.ts` 的索引与切分。
library;

import 'dart:collection';

import 'content_repository.dart';

const _ntBooks = {
  'MAT', 'MRK', 'LUK', 'JHN', 'ACT', 'ROM', '1CO', '2CO', 'GAL', 'EPH', 'PHP',
  'COL', '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM', 'HEB', 'JAS', '1PE', '2PE',
  '1JN', '2JN', '3JN', 'JUD', 'REV',
};

final _bookSenseHints = <String, RegExp>{
  'JHN': RegExp(r'使徒|所爱的门徒|福音作者|启示录'),
  '1JN': RegExp(r'使徒|所爱的门徒'),
  '2JN': RegExp(r'使徒|所爱的门徒'),
  '3JN': RegExp(r'使徒|所爱的门徒'),
  'REV': RegExp(r'使徒|拔摩|启示录'),
  'MRK': RegExp(r'马可|约翰马可'),
  'ACT': RegExp(r'施洗|先锋|马可'),
  'MAT': RegExp(r'施洗|先锋|使徒'),
  'LUK': RegExp(r'施洗|先锋|使徒'),
};

String _testamentForBook(String bookId) =>
    _ntBooks.contains(bookId.toUpperCase()) ? 'NT' : 'OT';

({String book, int chapter, int verse})? _refCoords(String ref) {
  final m = RegExp(
    r'^([1-3]?[A-Z]{2,4})[\s.:]+(\d+)[\s.:]+(\d+)',
    caseSensitive: false,
  ).firstMatch(ref.trim().replaceAll('.', ' '));
  if (m == null) return null;
  return (
    book: m.group(1)!.toUpperCase(),
    chapter: int.parse(m.group(2)!),
    verse: int.parse(m.group(3)!),
  );
}

/// 专名 → 候选词条列表（含 alias）。
Map<String, List<DictEntity>> buildDictIndex(List<DictEntity> entities) {
  final m = <String, List<DictEntity>>{};
  void push(String key, DictEntity ent) {
    final k = key.trim();
    if (k.length < 2) return;
    final list = m.putIfAbsent(k, () => <DictEntity>[]);
    if (!list.any((x) => x.id == ent.id)) list.add(ent);
  }

  for (final e in entities) {
    push(e.name, e);
    for (final a in e.aliases) {
      push(a, e);
    }
  }
  return m;
}

/// 按名称长度降序，便于贪心最长匹配。
List<String> dictSortedKeys(Map<String, List<DictEntity>> index) {
  final keys = index.keys.toList();
  keys.sort((a, b) => b.length.compareTo(a.length));
  return keys;
}

class DictToken {
  const DictToken({required this.text, this.entity});
  final String text;
  final DictEntity? entity;
}

/// 将经文切为普通文本与专名词条。
List<DictToken> splitDictTokens(
  String text,
  Map<String, List<DictEntity>> index,
  List<String> sortedKeys,
) {
  if (text.isEmpty || sortedKeys.isEmpty) {
    return [DictToken(text: text)];
  }
  final out = <DictToken>[];
  var i = 0;
  while (i < text.length) {
    String? hit;
    for (final key in sortedKeys) {
      if (i + key.length > text.length) continue;
      if (text.substring(i, i + key.length) == key) {
        hit = key;
        break;
      }
    }
    if (hit != null) {
      final cands = index[hit]!;
      out.add(DictToken(text: hit, entity: cands.first));
      i += hit.length;
    } else {
      final start = i;
      i++;
      while (i < text.length) {
        var matched = false;
        for (final key in sortedKeys) {
          if (i + key.length <= text.length &&
              text.substring(i, i + key.length) == key) {
            matched = true;
            break;
          }
        }
        if (matched) break;
        i++;
      }
      out.add(DictToken(text: text.substring(start, i)));
    }
  }
  return out;
}

String entityTypeLabel(String type) {
  switch (type) {
    case 'person':
      return '人物';
    case 'place':
      return '地点';
    case 'term':
      return '术语';
    case 'event':
      return '事件';
    default:
      return type;
  }
}

String entityDisplayName(DictEntity e) {
  final d = e.disambiguation?.trim();
  if (d == null || d.isEmpty) return e.name;
  return '${e.name}（$d）';
}

String entitySummaryText(DictEntity e) {
  final s = e.summary.trim();
  if (s.isEmpty) return '暂无简介';
  if (!RegExp(r'[\u4e00-\u9fff]').hasMatch(s)) {
    final label = entityTypeLabel(e.type);
    final t = label.isEmpty ? '词条' : label;
    return '圣经中的$t「${e.name}」。';
  }
  return s;
}

class DictSpanHit {
  const DictSpanHit({
    required this.start,
    required this.end,
    required this.entity,
    required this.name,
  });
  final int start;
  final int end;
  final DictEntity entity;
  final String name;
}

int scoreEntityForContext(
  DictEntity entity, {
  required String bookId,
  required int chapter,
  required int verse,
}) {
  var score = 0;
  final normalizedBook = bookId.toUpperCase();
  final ctxT = _testamentForBook(normalizedBook);
  final entT = entity.testament?.toUpperCase();
  if (entT == ctxT) score += 40;
  if (entT == 'BOTH') score += 20;

  final scope = entity.scopeBooks.map((b) => b.toUpperCase()).toSet();
  if (scope.contains(normalizedBook)) score += 80;

  final hint = _bookSenseHints[normalizedBook];
  if (hint != null) {
    final blob =
        '${entity.disambiguation ?? ''} ${entity.summary} ${entity.aliases.join(' ')}';
    if (hint.hasMatch(blob)) score += 100;
  }

  for (final rawRef in entity.refs) {
    final c = _refCoords(rawRef);
    if (c == null) continue;
    if (c.book == normalizedBook) {
      score += 30;
      if (c.chapter == chapter) {
        score += 20;
        score += (15 - (c.verse - verse).abs()).clamp(0, 15);
      }
    } else if (_testamentForBook(c.book) == ctxT) {
      score += 5;
    }
  }
  return score;
}

/// 低置信时不链正文，避免无关专名（尤其地点）误标。
bool shouldLinkDictEntity(
  List<DictEntity> candidates,
  DictEntity picked, {
  required int topScore,
  required int secondScore,
}) {
  if (candidates.length <= 1) {
    if (picked.type == 'place' && picked.name.length <= 2 && topScore < 30) {
      return false;
    }
    if (topScore < 15 && picked.refs.isEmpty) return false;
    return true;
  }
  if (topScore < 30) return false;
  if (topScore - secondScore < 50 && topScore < 80) return false;
  return true;
}

List<DictEntity> rankDictCandidates(
  List<DictEntity> candidates, {
  required String bookId,
  required int chapter,
  required int verse,
}) {
  return [...candidates]..sort(
    (a, b) =>
        scoreEntityForContext(
          b,
          bookId: bookId,
          chapter: chapter,
          verse: verse,
        ).compareTo(
          scoreEntityForContext(
            a,
            bookId: bookId,
            chapter: chapter,
            verse: verse,
          ),
        ),
  );
}

/// 整节最长匹配后的跨度（对齐 PWA dictionary_match 贪心）。
List<DictSpanHit> dictSpansForText(
  String text,
  Map<String, List<DictEntity>> index,
  List<String> sortedKeys, {
  required String bookId,
  required int chapter,
  required int verse,
}) {
  if (text.isEmpty || sortedKeys.isEmpty) return const [];
  final tokens = splitDictTokens(text, index, sortedKeys);
  final out = <DictSpanHit>[];
  var cursor = 0;
  for (final t in tokens) {
    final start = text.indexOf(t.text, cursor);
    if (start < 0) {
      cursor += t.text.length;
      continue;
    }
    final end = start + t.text.length;
    if (t.entity != null) {
      final cands = index[t.text] ?? [t.entity!];
      final ranked = rankDictCandidates(
        cands,
        bookId: bookId,
        chapter: chapter,
        verse: verse,
      );
      final top = ranked.first;
      final topScore = scoreEntityForContext(
        top,
        bookId: bookId,
        chapter: chapter,
        verse: verse,
      );
      final secondScore = ranked.length > 1
          ? scoreEntityForContext(
              ranked[1],
              bookId: bookId,
              chapter: chapter,
              verse: verse,
            )
          : 0;
      if (!shouldLinkDictEntity(
        ranked,
        top,
        topScore: topScore,
        secondScore: secondScore,
      )) {
        cursor = end;
        continue;
      }
      out.add(
        DictSpanHit(start: start, end: end, entity: top, name: t.text),
      );
    }
    cursor = end;
  }
  return out;
}

/// 词典包指纹：长度 + 首尾 id，供 span 缓存失效。
int dictListRevision(List<DictEntity> list) {
  if (list.isEmpty) return 0;
  return Object.hash(list.length, list.first.id, list.last.id);
}

// ignore: prefer_collection_literals
final _dictSpanCache = LinkedHashMap<String, List<DictSpanHit>>();
const _dictSpanCacheMax = 512;

String _dictSpanCacheKey({
  required int dictRev,
  required String bookId,
  required int chapter,
  required int verse,
  required String text,
}) => '$dictRev|$bookId|$chapter|$verse|${text.hashCode}';

/// 带容量上限的 LRU：同章滚动 / 壳层重建时复用切分结果。
List<DictSpanHit> cachedDictSpansForText(
  String text,
  Map<String, List<DictEntity>> index,
  List<String> sortedKeys, {
  required String bookId,
  required int chapter,
  required int verse,
  required int dictRev,
}) {
  final key = _dictSpanCacheKey(
    dictRev: dictRev,
    bookId: bookId,
    chapter: chapter,
    verse: verse,
    text: text,
  );
  final hit = _dictSpanCache.remove(key);
  if (hit != null) {
    _dictSpanCache[key] = hit;
    return hit;
  }
  final result = dictSpansForText(
    text,
    index,
    sortedKeys,
    bookId: bookId,
    chapter: chapter,
    verse: verse,
  );
  if (_dictSpanCache.length >= _dictSpanCacheMax) {
    _dictSpanCache.remove(_dictSpanCache.keys.first);
  }
  _dictSpanCache[key] = result;
  return result;
}

/// 词块是否落在某词典跨度内（词级芯片点按打开词典）。
(DictEntity, String)? matchDictSpanAt(
  int start,
  int end,
  List<DictSpanHit> spans,
) {
  for (final s in spans) {
    if (start < s.end && end > s.start) {
      return (s.entity, s.name);
    }
  }
  return null;
}
