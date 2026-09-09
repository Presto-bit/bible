/// done 事件 AnswerDocument 解析与 merge（对齐 Web `assistant_answer_document.ts`）。
library;

import 'assistant_format.dart';
import 'assistant_section_stream.dart';
import 'assistant_sections.dart';

class AnswerDocument {
  const AnswerDocument({
    this.schemaVersion,
    required this.markdown,
    this.sections = const [],
    this.followups = const [],
    this.lead,
    this.incomplete = false,
  });

  final int? schemaVersion;
  final String markdown;
  final List<AnswerSection> sections;
  final List<String> followups;
  final String? lead;
  final bool incomplete;

  factory AnswerDocument.fromJson(Map<String, dynamic> json) {
    final sections = (json['sections'] as List?)
            ?.map((e) => AnswerSection.fromJson(e as Map<String, dynamic>))
            .toList() ??
        const <AnswerSection>[];
    final followups = (json['followups'] as List?)
            ?.map((e) => e.toString())
            .where((s) => s.isNotEmpty)
            .toList() ??
        const <String>[];
    final meta = json['meta'] as Map<String, dynamic>?;
    return AnswerDocument(
      schemaVersion: json['schema_version'] as int?,
      markdown: (json['markdown'] ?? '') as String,
      sections: sections,
      followups: followups,
      lead: json['lead'] as String?,
      incomplete: meta?['incomplete'] == true,
    );
  }
}

class ResolvedDoneAnswer {
  const ResolvedDoneAnswer({
    required this.text,
    this.sections = const [],
    this.followups = const [],
    this.lead,
    this.incomplete = false,
  });

  final String text;
  final List<AnswerSection> sections;
  final List<String> followups;
  final String? lead;
  final bool incomplete;
}

ResolvedDoneAnswer resolveDoneAnswer(
  String streamedText, {
  String? doneText,
  List<AnswerSection> doneSections = const [],
  List<String> doneFollowups = const [],
  AnswerDocument? document,
  SectionStreamAccumulator? sectionStream,
}) {
  final streamBuilt =
      (sectionStream?.active ?? false) ? sectionStream!.toMarkdown().trim() : '';
  final effectiveStream =
      streamBuilt.isNotEmpty ? streamBuilt : streamedText.trim();
  final base = _resolveDoneAnswerCore(
    effectiveStream,
    doneText: doneText,
    doneSections: doneSections,
    doneFollowups: doneFollowups,
    document: document,
  );

  if (sectionStream == null || !sectionStream.active || streamBuilt.isEmpty) {
    return base;
  }

  final doneMd = base.text.trim();
  if (doneMd.isEmpty || doneMd == streamBuilt) {
    final sections = sectionStream.getSections();
    return ResolvedDoneAnswer(
      text: streamBuilt,
      sections: sections.isNotEmpty ? sections : base.sections,
      followups: base.followups,
      lead: base.lead,
      incomplete: base.incomplete,
    );
  }

  final doneLen = doneMd.length;
  final streamLen = streamBuilt.length;
  final doneSectionCount = base.sections.isNotEmpty
      ? base.sections.length
      : parseAnswerSections(doneMd).length;
  final streamSectionCount = sectionStream.getSections().length;
  final doneRicher =
      doneLen > streamLen + 40 || doneSectionCount > streamSectionCount;

  if (!doneRicher) {
    final sections = sectionStream.getSections();
    return ResolvedDoneAnswer(
      text: streamBuilt,
      sections: sections.isNotEmpty ? sections : base.sections,
      followups: base.followups,
      lead: base.lead,
      incomplete: base.incomplete,
    );
  }

  return base;
}

ResolvedDoneAnswer _resolveDoneAnswerCore(
  String streamedText, {
  String? doneText,
  List<AnswerSection> doneSections = const [],
  List<String> doneFollowups = const [],
  AnswerDocument? document,
}) {
  if (document != null && document.markdown.trim().isNotEmpty) {
    final md = document.markdown.trim();
    return ResolvedDoneAnswer(
      text: md,
      sections: document.sections.isNotEmpty
          ? document.sections
          : mergeAnswerSections(doneSections, md),
      followups: document.followups.isNotEmpty
          ? document.followups
          : doneFollowups,
      lead: document.lead,
      incomplete: document.incomplete,
    );
  }

  final streamed = streamedText.trim();
  final streamedBody = streamed.isNotEmpty ? bodyText(streamed) : '';
  final doneRaw = (doneText ?? '').trim();
  final doneBody = doneRaw.isNotEmpty ? bodyText(doneRaw) : '';

  var text = streamedBody.isNotEmpty ? streamedBody : doneBody;
  if (doneBody.isNotEmpty) {
    final streamedCount = parseAnswerSections(streamedBody).length;
    final doneCount = doneSections.isNotEmpty
        ? doneSections.length
        : parseAnswerSections(doneBody).length;
    final doneRicher = streamedBody.isEmpty ||
        doneBody.length > streamedBody.length + 8 ||
        doneCount > streamedCount;
    if (doneRicher) {
      text = doneBody;
    }
  }

  return ResolvedDoneAnswer(
    text: text,
    sections: mergeAnswerSections(doneSections, text),
    followups: doneFollowups,
  );
}
