/// 小爱输出的 Markdown 富文本渲染（对齐 PWA `AnswerTextMarkdown.tsx`）。
library;

import 'package:flutter/material.dart';

import '../../core/theme.dart';
import 'assistant_markdown.dart';

/// PWA `--assistant-answer-font-size: 16px`（Tab 内 17px；半屏/导读统一 16）。
const double kAssistantAnswerFontSize = 16;
const double kAssistantTabAnswerFontSize = 17;

/// 预处理 + 渲染小爱 Markdown（半屏/导读/对照等统一入口）。
class AssistantMarkdownBody extends StatelessWidget {
  const AssistantMarkdownBody({
    super.key,
    required this.text,
    this.fontSize = kAssistantAnswerFontSize,
    this.streaming = false,
    this.dense = false,
    this.onCitationTap,
  });

  final String text;
  final double fontSize;
  final bool streaming;
  final bool dense;
  final void Function(int n)? onCitationTap;

  @override
  Widget build(BuildContext context) {
    return AnswerText(
      text: prepareAssistantDisplay(text, streaming: streaming),
      fontSize: fontSize,
      streaming: streaming,
      dense: dense,
      onCitationTap: onCitationTap,
    );
  }
}

class AnswerText extends StatelessWidget {
  const AnswerText({
    super.key,
    required this.text,
    this.fontSize = kAssistantAnswerFontSize,
    this.streaming = false,
    this.dense = false,
    this.onCitationTap,
  });

  final String text;
  final double fontSize;
  final bool streaming;
  final bool dense;
  final void Function(int n)? onCitationTap;

  static final _labelRe = RegExp(r'^【([^】]+)】\s*(.*)$');
  static final _headingRe = RegExp(r'^(#{1,4})\s+(.*)$');
  static final _bulletRe = RegExp(r'^\s*[-*+•·]\s+(.*)$');
  static final _numberedRe = RegExp(r'^\s*(\d+)[.、)）]\s+(.*)$');
  static final _mdOrderedRe = RegExp(r'^\s*(\d+)\.\s+(.*)$');
  static final _circledRe = RegExp(r'^\s*([①②③④⑤⑥⑦⑧⑨⑩])[、.)）]?\s*(.*)$');
  static final _quoteRe = RegExp(r'^>\s?(.*)$');
  static final _hrRe = RegExp(r'^---+$');
  static final _tableSepRe = RegExp(r'^\|?[\s:-]+\|[\s|:-]+$');
  static final _boldRe = RegExp(r'\*\*([^*]+)\*\*');
  static final _italicRe = RegExp(r'(?<!\*)\*([^*]+)\*(?!\*)|_([^_]+)_');
  static final _codeInlineRe = RegExp(r'`([^`]+)`');
  static final _linkRe = RegExp(r'\[([^\]]+)\]\(([^)]+)\)');
  static final _citeRe = RegExp(
    r'［(\d{1,2})］|【(\d{1,2})】|（(\d{1,2})）|\[(\d{1,2})\](?!\()',
  );
  static final _viewpointRe = RegExp(r'观点\s*([ABC一二三]|[AaBbCc])');

  TextStyle _baseStyle({Color? color}) => TextStyle(
        fontSize: fontSize,
        height: 1.82,
        color: color ?? AppColors.ink,
      );

  List<InlineSpan> _inline(String s, TextStyle base) {
    if (s.isEmpty) return const [];
    final spans = <InlineSpan>[];
    var i = 0;
    while (i < s.length) {
      final link = _linkRe.matchAsPrefix(s, i);
      final code = _codeInlineRe.matchAsPrefix(s, i);
      final bold = _boldRe.matchAsPrefix(s, i);
      final italic = _italicRe.matchAsPrefix(s, i);
      final cite = _citeRe.matchAsPrefix(s, i);

      Match? pick;
      if (link != null) {
        pick = link;
      } else if (code != null) {
        pick = code;
      } else if (bold != null) {
        pick = bold;
      } else if (italic != null) {
        pick = italic;
      } else if (cite != null) {
        pick = cite;
      }

      if (pick == null) {
        spans.add(TextSpan(text: s.substring(i), style: base));
        break;
      }
      if (pick.start > i) {
        spans.add(TextSpan(text: s.substring(i, pick.start), style: base));
      }

      if (identical(pick.pattern, _linkRe.pattern)) {
        final label = pick.group(1)!;
        final href = pick.group(2)!;
        final citeN = parseCitationHref(href);
        if (citeN != null) {
          spans.add(_citationSpan(citeN, base));
        } else {
          spans.add(TextSpan(
            text: label,
            style: base.copyWith(
              color: AppColors.accentDeep,
              decoration: TextDecoration.underline,
              decorationColor: AppColors.accent.withValues(alpha: 0.45),
            ),
          ));
        }
      } else if (identical(pick.pattern, _codeInlineRe.pattern)) {
        spans.add(TextSpan(
          text: pick.group(1),
          style: base.copyWith(
            fontFamily: 'monospace',
            fontSize: fontSize * 0.92,
            backgroundColor: AppColors.surfaceSunken,
          ),
        ));
      } else if (identical(pick.pattern, _boldRe.pattern)) {
        spans.add(TextSpan(
          text: pick.group(1),
          style: base.copyWith(
            fontWeight: FontWeight.w700,
            color: AppColors.accentDeep,
          ),
        ));
      } else if (identical(pick.pattern, _italicRe.pattern)) {
        spans.add(TextSpan(
          text: pick.group(1) ?? pick.group(2),
          style: base.copyWith(fontStyle: FontStyle.italic),
        ));
      } else {
        final nStr =
            pick.group(1) ?? pick.group(2) ?? pick.group(3) ?? pick.group(4) ?? '';
        spans.add(_citationSpan(int.tryParse(nStr) ?? 0, base));
      }
      i = pick.end;
    }
    if (spans.isEmpty) return [TextSpan(style: base, text: s)];
    return spans;
  }

  InlineSpan _citationSpan(int n, TextStyle base) {
    return WidgetSpan(
      alignment: PlaceholderAlignment.aboveBaseline,
      baseline: TextBaseline.alphabetic,
      child: GestureDetector(
        onTap: onCitationTap != null && n > 0 ? () => onCitationTap!(n) : null,
        child: Padding(
          padding: const EdgeInsets.only(left: 1, right: 1),
          child: Text(
            '[$n]',
            style: TextStyle(
              fontSize: fontSize * 0.75,
              height: 1,
              fontWeight: FontWeight.w700,
              color: AppColors.accentDeep,
              decoration: onCitationTap != null
                  ? TextDecoration.underline
                  : TextDecoration.none,
              decorationColor: AppColors.accent.withValues(alpha: 0.45),
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final base = _baseStyle();
    if (streaming) {
      if (text.trim().isEmpty) {
        return Text(
          '小爱正在组织回答…',
          style: base.copyWith(color: AppColors.inkFaint),
        );
      }
      return Text.rich(
        TextSpan(style: base, children: _inline(text, base)),
      );
    }
    if (text.trim().isEmpty) {
      return Text('…', style: base.copyWith(color: AppColors.inkFaint));
    }

    final widgets = <Widget>[];
    final lines = text.split('\n');
    var i = 0;
    var afterSection = false;

    while (i < lines.length) {
      final raw = lines[i];
      final line = raw.trimRight();
      if (line.trim().isEmpty) {
        widgets.add(SizedBox(height: dense ? 4 : 6));
        i += 1;
        afterSection = false;
        continue;
      }

      if (line.trim().startsWith('```')) {
        final buf = <String>[];
        i += 1;
        while (i < lines.length && !lines[i].trim().startsWith('```')) {
          buf.add(lines[i]);
          i += 1;
        }
        if (i < lines.length) i += 1;
        widgets.add(_codeBlock(buf.join('\n')));
        afterSection = false;
        continue;
      }

      if (line.trim().startsWith('|')) {
        final tableLines = <String>[];
        while (i < lines.length && lines[i].trim().startsWith('|')) {
          tableLines.add(lines[i].trim());
          i += 1;
        }
        widgets.add(_tableBlock(tableLines));
        afterSection = false;
        continue;
      }

      final trimmed = line.trim();
      final label = _labelRe.firstMatch(trimmed);
      final heading = _headingRe.firstMatch(trimmed);
      final bullet = _bulletRe.firstMatch(trimmed);
      final numbered = _numberedRe.firstMatch(trimmed);
      final mdOrdered = _mdOrderedRe.firstMatch(trimmed);
      final circled = _circledRe.firstMatch(trimmed);
      final quote = _quoteRe.firstMatch(trimmed);
      final hr = _hrRe.hasMatch(trimmed);

      if (hr) {
        widgets.add(Padding(
          padding: EdgeInsets.symmetric(vertical: dense ? 8 : 12),
          child: const Divider(color: AppColors.line, height: 1),
        ));
        i += 1;
        afterSection = false;
        continue;
      }

      if (label != null) {
        widgets.add(_sectionHeading(label.group(1)!, tail: label.group(2) ?? ''));
        afterSection = (label.group(2) ?? '').isEmpty;
        i += 1;
        continue;
      }

      if (heading != null) {
        final level = heading.group(1)!.length;
        final title = heading.group(2)!.trim();
        if (level <= 3) {
          widgets.add(_sectionHeading(title, viewpoint: _viewpointRe.hasMatch(title)));
          afterSection = true;
        } else {
          widgets.add(Padding(
            padding: const EdgeInsets.only(top: 10, bottom: 4),
            child: Text(
              title,
              style: _baseStyle().copyWith(fontWeight: FontWeight.w700),
            ),
          ));
          afterSection = false;
        }
        i += 1;
        continue;
      }

      if (bullet != null) {
        widgets.add(_listRow(
          marker: _dotMarker(),
          content: bullet.group(1)!,
          base: base,
        ));
        afterSection = false;
        i += 1;
        continue;
      }

      if (numbered != null || mdOrdered != null) {
        final m = numbered ?? mdOrdered!;
        widgets.add(_listRow(
          marker: _indexMarker('${m.group(1)!}${numbered != null ? '、' : '.'} ', base),
          content: m.group(2)!,
          base: base,
        ));
        afterSection = false;
        i += 1;
        continue;
      }

      if (circled != null) {
        widgets.add(_listRow(
          marker: _indexMarker('${circled.group(1)!} ', base),
          content: circled.group(2)!,
          base: base,
        ));
        afterSection = false;
        i += 1;
        continue;
      }

      if (quote != null) {
        widgets.add(Container(
          margin: EdgeInsets.symmetric(vertical: dense ? 4 : 8),
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
          decoration: const BoxDecoration(
            color: AppColors.accentWash,
            border: Border(left: BorderSide(color: AppColors.gold, width: 3)),
            borderRadius: BorderRadius.only(
              topRight: Radius.circular(12),
              bottomRight: Radius.circular(12),
            ),
          ),
          child: Text.rich(
            TextSpan(
              children: _inline(
                quote.group(1)!,
                _baseStyle(color: AppColors.inkSoft),
              ),
            ),
          ),
        ));
        afterSection = false;
        i += 1;
        continue;
      }

      final para = Padding(
        padding: EdgeInsets.only(bottom: dense ? 6 : 10),
        child: Text.rich(TextSpan(children: _inline(trimmed, base))),
      );
      if (afterSection) {
        widgets.add(Container(
          width: double.infinity,
          margin: const EdgeInsets.only(bottom: 10),
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Text.rich(TextSpan(children: _inline(trimmed, base))),
        ));
        afterSection = false;
      } else {
        widgets.add(para);
      }
      i += 1;
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: widgets,
    );
  }

  Widget _sectionHeading(
    String title, {
    String tail = '',
    bool viewpoint = false,
  }) {
    final isViewpointB = RegExp(r'观点\s*(B|二|b)').hasMatch(title);
    return Padding(
      padding: const EdgeInsets.only(top: 12, bottom: 6),
      child: Wrap(
        crossAxisAlignment: WrapCrossAlignment.center,
        spacing: 8,
        runSpacing: 6,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: viewpoint
                  ? (isViewpointB
                      ? AppColors.gold.withValues(alpha: 0.18)
                      : AppColors.accentWash)
                  : AppColors.surface,
              borderRadius: BorderRadius.circular(999),
              border: viewpoint
                  ? Border.all(
                      color: isViewpointB ? AppColors.gold : AppColors.accentDeep,
                      width: 1,
                    )
                  : null,
            ),
            child: Text(
              title,
              style: TextStyle(
                fontSize: fontSize - 1,
                fontWeight: FontWeight.w700,
                color: AppColors.accentDeep,
                height: 1.4,
              ),
            ),
          ),
          if (tail.isNotEmpty)
            Text.rich(TextSpan(children: _inline(tail, _baseStyle()))),
        ],
      ),
    );
  }

  Widget _codeBlock(String code) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.symmetric(vertical: 8),
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      decoration: BoxDecoration(
        color: AppColors.surfaceSunken,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        code,
        style: TextStyle(
          fontFamily: 'monospace',
          fontSize: fontSize * 0.9,
          height: 1.55,
          color: AppColors.ink,
        ),
      ),
    );
  }

  Widget _tableBlock(List<String> lines) {
    if (lines.isEmpty) return const SizedBox.shrink();
    final rows = <List<String>>[];
    for (final line in lines) {
      if (_tableSepRe.hasMatch(line.replaceAll(' ', ''))) continue;
      final cells = line
          .split('|')
          .map((c) => c.trim())
          .where((c) => c.isNotEmpty)
          .toList();
      if (cells.isNotEmpty) rows.add(cells);
    }
    if (rows.isEmpty) return const SizedBox.shrink();
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 8),
      decoration: BoxDecoration(
        border: Border.all(color: AppColors.line),
        borderRadius: BorderRadius.circular(12),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: Table(
          defaultVerticalAlignment: TableCellVerticalAlignment.top,
          columnWidths: {
            for (var c = 0; c < rows.first.length; c++)
              c: const IntrinsicColumnWidth(),
          },
          children: [
            for (var r = 0; r < rows.length; r++)
              TableRow(
                decoration: BoxDecoration(
                  color: r == 0 ? AppColors.accentWash : null,
                  border: r < rows.length - 1
                      ? const Border(bottom: BorderSide(color: AppColors.line))
                      : null,
                ),
                children: [
                  for (final cell in rows[r])
                    Padding(
                      padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
                      child: Text.rich(
                        TextSpan(
                          children: _inline(
                            cell,
                            TextStyle(
                              fontSize: fontSize - 1,
                              height: 1.55,
                              color: r == 0 ? AppColors.accentDeep : AppColors.ink,
                              fontWeight:
                                  r == 0 ? FontWeight.w700 : FontWeight.w400,
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
          ],
        ),
      ),
    );
  }

  Widget _dotMarker() {
    return Padding(
      padding: const EdgeInsets.only(top: 8, right: 8, left: 2),
      child: Container(
        width: 5,
        height: 5,
        decoration: const BoxDecoration(
          color: AppColors.accent,
          shape: BoxShape.circle,
        ),
      ),
    );
  }

  Widget _indexMarker(String label, TextStyle base) {
    return Padding(
      padding: const EdgeInsets.only(right: 6, left: 2),
      child: Text(
        label,
        style: base.copyWith(
          fontWeight: FontWeight.w700,
          color: AppColors.accentDeep,
        ),
      ),
    );
  }

  Widget _listRow({
    required Widget marker,
    required String content,
    required TextStyle base,
  }) {
    return Padding(
      padding: const EdgeInsets.only(top: 2, bottom: 2),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          marker,
          Expanded(
            child: Text.rich(TextSpan(children: _inline(content, base))),
          ),
        ],
      ),
    );
  }
}
