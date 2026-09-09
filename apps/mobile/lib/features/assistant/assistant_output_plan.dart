/// meta.output_plan 解析（对齐 Web `assistant_output_plan.ts`）。
library;

import 'assistant_format.dart';
import 'assistant_sections.dart';

class OutputPlan {
  const OutputPlan({
    this.depth,
    this.sectionPolicy,
    this.preferProse = false,
    this.lead = true,
    this.sections = const [],
    this.budgetChars,
    this.softMaxChars,
    this.minComplete,
    this.maxFollowups = 0,
  });

  final String? depth;
  final String? sectionPolicy;
  final bool preferProse;
  final bool lead;
  final List<String> sections;
  final int? budgetChars;
  final int? softMaxChars;
  final int? minComplete;
  final int maxFollowups;

  factory OutputPlan.fromJson(Map<String, dynamic> json) {
    final sections = (json['sections'] as List?)
            ?.map((e) => e.toString())
            .where((s) => s.isNotEmpty)
            .toList() ??
        const <String>[];
    return OutputPlan(
      depth: json['depth'] as String?,
      sectionPolicy: json['section_policy'] as String?,
      preferProse: json['prefer_prose'] == true,
      lead: json['lead'] != false,
      sections: sections,
      budgetChars: json['budget_chars'] as int?,
      softMaxChars: json['soft_max_chars'] as int?,
      minComplete: json['min_complete'] as int?,
      maxFollowups: (json['max_followups'] ?? 0) as int,
    );
  }
}

/// 流式阶段是否展示小节骨架（flash/lead_only 仅一节也显示）。
bool shouldShowOutputPlanSkeleton(OutputPlan? plan) {
  final n = plan?.sections.length ?? 0;
  if (n == 0) return false;
  if (plan?.sectionPolicy == 'lead_only') return n >= 1;
  return n >= 2;
}

/// section_stream 预种子：lead_only 只挂摘要，soft 最多两节。
List<String> streamSeedTitles(OutputPlan? plan) {
  if (plan == null || plan.sections.isEmpty) return const [];
  switch (plan.sectionPolicy) {
    case 'lead_only':
      return plan.sections.take(1).toList();
    case 'soft':
      return plan.sections.take(2).toList();
    default:
      return plan.sections;
  }
}

List<AnswerSection> planToSections(OutputPlan? plan) {
  if (plan == null || plan.sections.isEmpty) return const [];
  return plan.sections
      .map((title) => AnswerSection(id: sectionSlug(title), title: title))
      .toList();
}

List<AnswerSection> skeletonSectionsFromPlan(OutputPlan? plan) {
  return streamSeedTitles(plan)
      .map((title) => AnswerSection(id: sectionSlug(title), title: title))
      .toList();
}

bool shouldShowSectionToc({
  required List<AnswerSection> sections,
  OutputPlan? outputPlan,
  required bool streaming,
  required Set<String> writtenSectionIds,
}) {
  if (sections.length < 2) return false;
  if (!streaming) return true;
  final policy = outputPlan?.sectionPolicy ?? 'full';
  if (policy == 'lead_only' || policy == 'soft') {
    return writtenSectionIds.length >= 2;
  }
  return sections.length >= 2;
}

List<AnswerSection> mergePlannedSections({
  OutputPlan? outputPlan,
  List<AnswerSection>? fromDone,
  required String text,
  bool streaming = false,
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
  if (streaming && (outputPlan?.sections.isNotEmpty ?? false)) {
    final parsed = parseAnswerSections(bodyText(text));
    if (parsed.isNotEmpty) return parsed;
    return skeletonSectionsFromPlan(outputPlan);
  }
  final planned = planToSections(outputPlan);
  if (planned.isNotEmpty) return planned;
  return parseAnswerSections(bodyText(text));
}
