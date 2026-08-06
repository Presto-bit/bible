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
