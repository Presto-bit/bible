/// 小爱 blocks / 时间轴 / 静态结构（对齐 Web `assistant_blocks.ts`）。
library;

import 'assistant_format.dart';

class TimelineNode {
  const TimelineNode({
    required this.year,
    required this.label,
    this.note,
  });

  final String year;
  final String label;
  final String? note;

  factory TimelineNode.fromJson(Map<String, dynamic> j) => TimelineNode(
        year: (j['year'] ?? '') as String,
        label: (j['label'] ?? j['year'] ?? '') as String,
        note: j['note'] as String?,
      );
}

class StructureAsset {
  const StructureAsset({
    required this.kind,
    required this.id,
    required this.label,
    this.subtitle,
    this.href,
    this.nodes = const [],
  });

  final String kind;
  final String id;
  final String label;
  final String? subtitle;
  final String? href;
  final List<TimelineNode> nodes;

  factory StructureAsset.fromJson(Map<String, dynamic> j) => StructureAsset(
        kind: (j['kind'] ?? '') as String,
        id: (j['id'] ?? '') as String,
        label: (j['label'] ?? '') as String,
        subtitle: j['subtitle'] as String?,
        href: j['href'] as String?,
        nodes: ((j['nodes'] ?? []) as List)
            .map((e) => TimelineNode.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

const _timelineSectionTitles = {
  '时间线',
  '年代脉络',
  '历史脉络',
  '人物生平',
  '年代',
};
final _timelineItemRe = RegExp(
  r'^\s*(?:[-*•]|\d+[.)、])\s+\*\*(.+?)\*\*\s*(.*)$',
);

List<TimelineNode> parseTimelineNodes(String text) {
  final body = bodyText(text).trim();
  if (body.isEmpty) return const [];
  final titles = _timelineSectionTitles.join('|');
  final sectionRe = RegExp('(?:^|\\n)###\\s+(?:$titles)\\s*\\n', multiLine: true);
  final m = sectionRe.firstMatch(body);
  if (m == null) return const [];
  final tail = body.substring(m.end);
  final nextIdx = tail.indexOf(RegExp(r'\n###\s+'));
  final chunk = nextIdx >= 0 ? tail.substring(0, nextIdx) : tail;
  final nodes = <TimelineNode>[];
  for (final line in chunk.split('\n')) {
    final mm = _timelineItemRe.firstMatch(line.trim());
    if (mm == null) continue;
    final year = mm.group(1)!.trim();
    final note = (mm.group(2) ?? '').trim();
    nodes.add(TimelineNode(year: year, label: note.isEmpty ? year : note, note: note));
  }
  return nodes.length > 8 ? nodes.sublist(0, 8) : nodes;
}

Set<String> streamingWrittenSections(
  String text,
  List<({String id, String title})> sections,
) {
  final written = <String>{};
  final body = bodyText(text);
  for (final sec in sections) {
    final escaped = RegExp.escape(sec.title);
    if (RegExp('(?:^|\\n)###\\s+$escaped\\s*\\n+\\S', multiLine: true)
        .hasMatch(body)) {
      written.add(sec.id);
    }
  }
  return written;
}

String extractStudySheetCopyText(String text) {
  final body = bodyText(text);
  final m = RegExp(
    r'(?:^|\n)###\s*讨论问题\s*\n([\s\S]*?)(?=\n###\s+|$)',
  ).firstMatch(body);
  if (m == null) return '';
  final lines = m.group(1)!.split('\n');
  final out = <String>[];
  var i = 1;
  for (final ln in lines) {
    final q = ln.replaceFirst(RegExp(r'^\s*(?:[-*•]|\d+[.)、])\s+'), '').trim();
    if (q.isEmpty) continue;
    out.add('$i. $q');
    i += 1;
  }
  return out.join('\n\n');
}
