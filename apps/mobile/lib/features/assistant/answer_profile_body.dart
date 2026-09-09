/// 回答 profile + TOC + 流式摘要优先（对齐 PWA `AnswerProfileBody.tsx`）。
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/theme.dart';
import 'answer_text.dart' show AssistantMarkdownBody, kAssistantAnswerFontSize;
import 'assistant_blocks.dart';
import 'assistant_format.dart';
import 'assistant_markdown.dart';
import 'assistant_output_plan.dart';
import 'assistant_sections.dart';
import 'answer_section_skeleton.dart';
import 'section_toc.dart';
import 'structure_asset_card.dart';
import 'timeline_rail.dart';

class AnswerProfileBody extends StatefulWidget {
  const AnswerProfileBody({
    super.key,
    required this.text,
    this.fontSize = kAssistantAnswerFontSize,
    this.streaming = false,
    this.dense = false,
    this.responseProfile,
    this.sections,
    this.outputPlan,
    this.structureAssets = const [],
    this.defaultCollapsed = false,
    this.collapseMinBodyLen = 80,
    this.expandLabel = '展开全文',
    this.onCitationTap,
    this.streamSummaryFirst = true,
  });

  final String text;
  final double fontSize;
  final bool streaming;
  final bool dense;
  final String? responseProfile;
  final List<AnswerSection>? sections;
  final OutputPlan? outputPlan;
  final List<StructureAsset> structureAssets;
  final bool defaultCollapsed;
  final int collapseMinBodyLen;
  final String expandLabel;
  final void Function(int n)? onCitationTap;
  final bool streamSummaryFirst;

  @override
  State<AnswerProfileBody> createState() => _AnswerProfileBodyState();
}

class _AnswerProfileBodyState extends State<AnswerProfileBody> {
  bool _copiedStudy = false;

  @override
  Widget build(BuildContext context) {
    final clean = bodyText(widget.text);
    final merged = mergePlannedSections(
      outputPlan: widget.outputPlan,
      fromDone: widget.sections,
      text: clean,
      streaming: widget.streaming,
    );
    final writtenIds = widget.streaming
        ? streamingWrittenSections(clean, merged.map((s) => (id: s.id, title: s.title)).toList())
        : <String>{};
    final showSectionToc = shouldShowSectionToc(
          sections: merged,
          outputPlan: widget.outputPlan,
          streaming: widget.streaming,
          writtenSectionIds: writtenIds,
        ) &&
        (widget.streaming || (widget.sections?.isNotEmpty ?? false));
    final timelineNodes = parseTimelineNodes(clean);
    final profile = widget.responseProfile ?? '';
    final showPreset = !widget.streaming &&
        widget.structureAssets.isNotEmpty &&
        (profile == 'structure_map' || profile == 'timeline_rail');
    final showParsedTimeline = timelineNodes.length >= 2 &&
        (profile == 'timeline_rail' ||
            merged.any((s) => s.title == '时间线'));
    final studyCopy = profile == 'study_sheet'
        ? extractStudySheetCopyText(clean)
        : '';

    final lead = extractSummaryLead(clean);
    final showStreamLead = widget.streaming &&
        widget.streamSummaryFirst &&
        lead.summary.trim().isNotEmpty;

    if (showStreamLead) {
      final tail = lead.body.trim().isNotEmpty ? lead.body : clean;
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (showSectionToc) ...[
            SectionToc(
              sections: merged,
              writtenSectionIds: writtenIds,
              streaming: widget.streaming,
              onSelect: (_) {},
            ),
            const SizedBox(height: 8),
          ],
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              lead.summary,
              style: TextStyle(
                fontSize: widget.fontSize + 1,
                fontWeight: FontWeight.w600,
                height: 1.72,
                color: AppColors.ink,
              ),
            ),
          ),
          if (tail.trim().isNotEmpty) ...[
            const SizedBox(height: 8),
            AssistantMarkdownBody(
              text: tail,
              fontSize: widget.fontSize,
              streaming: true,
              dense: widget.dense,
              onCitationTap: widget.onCitationTap,
            ),
          ],
          if (widget.streaming)
            AnswerSectionSkeleton(
              sections: merged,
              writtenSectionIds: writtenIds,
            ),
        ],
      );
    }

    final hasBody = clean.trim().isNotEmpty;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (showSectionToc) ...[
          SectionToc(
            sections: merged,
            writtenSectionIds: writtenIds,
            streaming: widget.streaming,
            onSelect: (_) {},
          ),
          const SizedBox(height: 8),
        ],
        if (showPreset) StructureAssetCard(asset: widget.structureAssets.first),
        if (showParsedTimeline) TimelineRail(nodes: timelineNodes),
        if (studyCopy.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: TextButton(
              style: TextButton.styleFrom(
                padding: EdgeInsets.zero,
                minimumSize: Size.zero,
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
              onPressed: () async {
                await Clipboard.setData(ClipboardData(text: studyCopy));
                setState(() => _copiedStudy = true);
                Future<void>.delayed(const Duration(milliseconds: 1600), () {
                  if (mounted) setState(() => _copiedStudy = false);
                });
              },
              child: Text(_copiedStudy ? '已复制讨论题' : '复制讨论题'),
            ),
          ),
        if (hasBody)
          AssistantMarkdownBody(
            text: widget.text,
            fontSize: widget.fontSize,
            streaming: widget.streaming,
            dense: widget.dense,
            onCitationTap: widget.onCitationTap,
          ),
        if (widget.streaming)
          AnswerSectionSkeleton(
            sections: merged,
            writtenSectionIds: writtenIds,
          ),
      ],
    );
  }
}
