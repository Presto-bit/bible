/// 词典正文匹配：对齐 Web `dictionary_match.ts` 的索引与切分。
library;

import 'content_repository.dart';

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
      // 聚合连续非专名字符
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

/// 整节最长匹配后的跨度（对齐 PWA dictionary_match 贪心）。
List<DictSpanHit> dictSpansForText(
  String text,
  Map<String, List<DictEntity>> index,
  List<String> sortedKeys,
) {
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
      out.add(DictSpanHit(
        start: start,
        end: end,
        entity: t.entity!,
        name: t.text,
      ));
    }
    cursor = end;
  }
  return out;
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
