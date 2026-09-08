/// 摘要置顶 + 可展开全文（对齐 PWA `AnswerExpandable.tsx`）。
library;

import 'package:flutter/material.dart';

import '../../core/theme.dart';
import '../assistant/assistant_format.dart';
import '../assistant/assistant_markdown.dart';
import 'answer_text.dart' show AssistantMarkdownBody;

class AnswerExpandable extends StatefulWidget {
  const AnswerExpandable({
    super.key,
    required this.text,
    this.fontSize = kAssistantAnswerFontSize,
    this.streaming = false,
    this.dense = false,
    this.defaultCollapsed = false,
    this.collapseMinBodyLen = 80,
    this.expandLabel = '展开全文',
    this.onCitationTap,
  });

  final String text;
  final double fontSize;
  final bool streaming;
  final bool dense;
  final bool defaultCollapsed;
  final int collapseMinBodyLen;
  final String expandLabel;
  final void Function(int n)? onCitationTap;

  @override
  State<AnswerExpandable> createState() => _AnswerExpandableState();
}

class _AnswerExpandableState extends State<AnswerExpandable> {
  late bool _expanded;

  @override
  void initState() {
    super.initState();
    _expanded = !widget.defaultCollapsed;
  }

  @override
  void didUpdateWidget(covariant AnswerExpandable oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.text != widget.text && widget.streaming) {
      _expanded = !widget.defaultCollapsed;
    }
  }

  @override
  Widget build(BuildContext context) {
    final clean = bodyText(widget.text);
    final lead = extractSummaryLead(clean);
    final canCollapse = !widget.streaming
        && lead.summary.isNotEmpty
        && lead.body.trim().length >= widget.collapseMinBodyLen;

    if (!canCollapse || _expanded) {
      return AssistantMarkdownBody(
        text: widget.text,
        fontSize: widget.fontSize,
        streaming: widget.streaming,
        dense: widget.dense,
        onCitationTap: widget.onCitationTap,
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Text(
            lead.summary,
            style: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w600,
              height: 1.72,
              color: AppColors.ink,
            ),
          ),
        ),
        const SizedBox(height: 8),
        TextButton(
          style: TextButton.styleFrom(
            padding: EdgeInsets.zero,
            minimumSize: Size.zero,
            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
          ),
          onPressed: () => setState(() => _expanded = true),
          child: Text(widget.expandLabel),
        ),
      ],
    );
  }
}
