/// meta.output_plan 解析（对齐 Web `assistant_output_plan.ts`）。
library;

import 'assistant_format.dart';
import 'assistant_sections.dart';

class OutputPlan {
  const OutputPlan({
    this.lead = true,
    this.sections = const [],
    this.budgetChars,
    this.maxFollowups = 0,
  });

  final bool lead;
  final List<String> sections;
  final int? budgetChars;
  final int maxFollowups;

  factory OutputPlan.fromJson(Map<String, dynamic> json) {
    final sections = (json['sections'] as List?)
            ?.map((e) => e.toString())
            .where((s) => s.isNotEmpty)
            .toList() ??
        const <String>[];
    return OutputPlan(
      lead: json['lead'] != false,
      sections: sections,
      budgetChars: json['budget_chars'] as int?,
      maxFollowups: (json['max_followups'] ?? 0) as int,
    );
  }
}

List<AnswerSection> planToSections(OutputPlan? plan) {
  if (plan == null || plan.sections.isEmpty) return const [];
  return plan.sections
      .map((title) => AnswerSection(id: sectionSlug(title), title: title))
      .toList();
}

List<AnswerSection> mergePlannedSections({
  OutputPlan? outputPlan,
  List<AnswerSection>? fromDone,
  required String text,
}) {
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
  final planned = planToSections(outputPlan);
  if (planned.isNotEmpty) return planned;
  return parseAnswerSections(bodyText(text));
}
