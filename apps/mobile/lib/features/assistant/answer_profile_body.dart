/// 回答渲染：无 TOC，流式 skeleton + 完成 Markdown（对齐 PWA）。
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/theme.dart';
import 'answer_section_skeleton.dart';
import 'answer_text.dart' show AssistantMarkdownBody, kAssistantAnswerFontSize;
import 'assistant_blocks.dart';
import 'assistant_format.dart';
import 'assistant_section_stream.dart' show StreamSection;
import 'assistant_sections.dart';
import 'assistant_visible.dart';
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
    this.structureAssets = const [],
    this.streamSections,
    this.onCitationTap,
  });

  final String text;
  final double fontSize;
  final bool streaming;
  final bool dense;
  final String? responseProfile;
  final List<StructureAsset> structureAssets;
  final List<StreamSection>? streamSections;
  final void Function(int n)? onCitationTap;

  @override
  State<AnswerProfileBody> createState() => _AnswerProfileBodyState();
}

class _AnswerProfileBodyState extends State<AnswerProfileBody> {
  bool _copiedStudy = false;

  @override
  Widget build(BuildContext context) {
    final streamSections = widget.streamSections;
    final writtenSections = streamSections
        ?.where((s) => s.text.trim().isNotEmpty)
        .toList();
    final clean = bodyText(widget.text);
    final hasWritten = hasVisibleAssistantAnswer(
      widget.text,
      streamSections: widget.streaming ? streamSections : null,
    );
    final showSkeleton = widget.streaming &&
        hasWritten &&
        streamSections != null &&
        streamSections.any((s) => s.text.trim().isEmpty);

    if (!hasWritten) return const SizedBox.shrink();

    final timelineNodes = parseTimelineNodes(clean);
    final profile = widget.responseProfile ?? '';
    final showPreset = !widget.streaming &&
        widget.structureAssets.isNotEmpty &&
        (profile == 'structure_map' || profile == 'timeline_rail');
    final showParsedTimeline = timelineNodes.length >= 2 &&
        (profile == 'timeline_rail' ||
            RegExp(r'###\s*时间线').hasMatch(clean));
    final studyCopy = profile == 'study_sheet'
        ? extractStudySheetCopyText(clean)
        : '';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
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
        if (hasWritten)
          AssistantMarkdownBody(
            text: widget.text,
            fontSize: widget.fontSize,
            streaming: widget.streaming,
            dense: widget.dense,
            streamSections: widget.streaming &&
                    writtenSections != null &&
                    writtenSections.isNotEmpty
                ? writtenSections
                : widget.streamSections,
            onCitationTap: widget.onCitationTap,
          ),
        if (showSkeleton && streamSections != null)
          AnswerSectionSkeleton(
            sections: streamSections
                .map((s) => AnswerSection(id: s.id, title: s.title))
                .toList(),
            writtenSectionIds: writtenSectionIdsFromStream(streamSections),
          ),
      ],
    );
  }
}
