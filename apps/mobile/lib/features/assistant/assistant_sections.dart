/// 小爱回答小节解析（对齐 Web `assistant_sections.ts`）。
library;

import 'assistant_format.dart';

class AnswerSection {
  const AnswerSection({required this.id, required this.title});

  final String id;
  final String title;

  factory AnswerSection.fromJson(Map<String, dynamic> j) => AnswerSection(
        id: (j['id'] ?? sectionSlug((j['title'] ?? '') as String)) as String,
        title: (j['title'] ?? '') as String,
      );
}

String sectionSlug(String title) {
  final base = title.trim().replaceAll(RegExp(r'\s+'), '-');
  final safe = base.replaceAll(RegExp(r'[^\w\u4e00-\u9fff-]'), '');
  return safe.isEmpty ? 'sec-section' : 'sec-$safe';
}

List<AnswerSection> parseAnswerSections(String text) {
  final sections = <AnswerSection>[];
  final md = RegExp(r'^###\s+(.+)$', multiLine: true);
  for (final m in md.allMatches(text)) {
    final title = m.group(1)?.trim() ?? '';
    if (title.isEmpty || title == '相关追问') break;
    sections.add(AnswerSection(id: sectionSlug(title), title: title));
  }
  if (sections.isNotEmpty) return sections;
  final legacy = RegExp(r'【([^】]+)】');
  for (final m in legacy.allMatches(text)) {
    final title = m.group(1)?.trim() ?? '';
    if (title.isEmpty || title == '相关追问') break;
    sections.add(AnswerSection(id: sectionSlug(title), title: title));
  }
  return sections;
}

List<AnswerSection> mergeAnswerSections(
  List<AnswerSection>? fromDone,
  String text,
) {
  if (fromDone != null && fromDone.isNotEmpty) {
    return fromDone
        .map(
          (s) => AnswerSection(
            id: s.id.trim().isEmpty ? sectionSlug(s.title) : s.id,
            title: s.title,
          ),
        )
        .toList();
  }
  return parseAnswerSections(bodyText(text));
}

const leadSectionTitles = {'摘要', '本章概览', '卷概览'};
