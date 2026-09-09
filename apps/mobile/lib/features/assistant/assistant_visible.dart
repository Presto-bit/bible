/// 流式是否已有可见正文（有内容即隐藏思考行）。
library;

import 'assistant_format.dart';
import 'assistant_section_stream.dart';

const kMinSectionBodyChars = 20;

bool hasVisibleAnswerContent(String text, {int minChars = 8}) {
  final t = bodyText(text).trim();
  if (t.isEmpty) return false;

  final sectionRe = RegExp(
    r'(?:^|\n)###\s+(.+?)\s*\n([\s\S]*?)(?=\n### |\z)',
    multiLine: true,
  );
  for (final m in sectionRe.allMatches(t)) {
    final body = (m.group(2) ?? '').trim();
    if (body.length >= kMinSectionBodyChars) return true;
  }

  final withoutHeadings = t
      .replaceAll(RegExp(r'(?:^|\n)###\s+.+\s*', multiLine: true), '')
      .trim();
  if (withoutHeadings.length >= minChars) return true;
  return false;
}

bool hasVisibleStreamSections(List<StreamSection>? sections) {
  if (sections == null || sections.isEmpty) return false;
  return sections.any((s) => s.text.trim().length >= kMinSectionBodyChars);
}

bool hasVisibleAssistantAnswer(
  String text, {
  List<StreamSection>? streamSections,
}) {
  return hasVisibleAnswerContent(text) ||
      hasVisibleStreamSections(streamSections);
}

String? currentWritingSectionTitle(List<StreamSection>? sections) {
  if (sections == null || sections.isEmpty) return null;
  for (final s in sections) {
    if (s.text.trim().isEmpty) return s.title;
  }
  final last = sections.last;
  if (!last.finalized) return last.title;
  return null;
}

Set<String> writtenSectionIdsFromStream(List<StreamSection> sections) {
  return sections
      .where((s) => s.text.trim().isNotEmpty)
      .map((s) => s.id)
      .toSet();
}
