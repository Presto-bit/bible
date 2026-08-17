/// 小爱输出的轻量富文本渲染：支持 【小标题】/ ## 标题 / **加粗** / 列表 / > 引用，
/// 以及脚标上标 [n] / ［n］（对齐 H5 linkifyCitations）。
library;

import 'package:flutter/material.dart';

import '../../core/theme.dart';

class AnswerText extends StatelessWidget {
  const AnswerText({
    super.key,
    required this.text,
    this.fontSize = 15,
    this.streaming = false,
    this.onCitationTap,
  });

  final String text;
  final double fontSize;
  final bool streaming;
  final void Function(int n)? onCitationTap;

  static final _labelRe = RegExp(r'^【([^】]+)】\s*(.*)$');
  static final _headingRe = RegExp(r'^#{1,4}\s+(.*)$');
  static final _bulletRe = RegExp(r'^\s*[-•·]\s+(.*)$');
  static final _numberedRe = RegExp(r'^\s*(\d+)[.、)）]\s+(.*)$');
  static final _circledRe = RegExp(r'^\s*([①②③④⑤⑥⑦⑧⑨⑩])[、.)）]?\s*(.*)$');
  static final _quoteRe = RegExp(r'^>\s?(.*)$');
  static final _boldRe = RegExp(r'\*\*([^*]+)\*\*');
  /// ［n］|【n】|（n）|[n] 脚标（n 为 1–2 位数字）
  static final _citeRe = RegExp(r'［(\d{1,2})］|【(\d{1,2})】|（(\d{1,2})）|\[(\d{1,2})\]');

  List<InlineSpan> _inline(String s, TextStyle base) {
    // 先拆脚标，再在纯文本段内拆加粗
    final spans = <InlineSpan>[];
    var last = 0;
    for (final m in _citeRe.allMatches(s)) {
      if (m.start > last) {
        spans.addAll(_boldSpans(s.substring(last, m.start), base));
      }
      final nStr = m.group(1) ?? m.group(2) ?? m.group(3) ?? m.group(4) ?? '';
      final n = int.tryParse(nStr) ?? 0;
      spans.add(WidgetSpan(
        alignment: PlaceholderAlignment.aboveBaseline,
        baseline: TextBaseline.alphabetic,
        child: GestureDetector(
          onTap: onCitationTap != null && n > 0
              ? () => onCitationTap!(n)
              : null,
          child: Padding(
            padding: const EdgeInsets.only(left: 1, right: 1),
            child: Text(
              '[$n]',
              style: TextStyle(
                fontSize: fontSize * 0.72,
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
      ));
      last = m.end;
    }
    if (last < s.length) {
      spans.addAll(_boldSpans(s.substring(last), base));
    }
    if (spans.isEmpty) {
      return [TextSpan(style: base, text: s)];
    }
    return [TextSpan(style: base, children: spans)];
  }

  List<InlineSpan> _boldSpans(String s, TextStyle base) {
    if (s.isEmpty) return const [];
    final spans = <InlineSpan>[];
    var last = 0;
    for (final m in _boldRe.allMatches(s)) {
      if (m.start > last) {
        spans.add(TextSpan(text: s.substring(last, m.start), style: base));
      }
      spans.add(TextSpan(
        text: m.group(1),
        style: base.copyWith(
          fontWeight: FontWeight.w700,
          color: AppColors.accentDeep,
        ),
      ));
      last = m.end;
    }
    if (last < s.length) {
      spans.add(TextSpan(text: s.substring(last), style: base));
    }
    return spans;
  }

  @override
  Widget build(BuildContext context) {
    final base = TextStyle(
        fontSize: fontSize, height: 1.78, color: AppColors.ink);
    if (streaming) {
      return RichText(
        text: TextSpan(style: base, children: _inline(text, base)),
      );
    }
    final lines = text.split('\n');
    final widgets = <Widget>[];

    for (final raw in lines) {
      final line = raw.trimRight();
      if (line.trim().isEmpty) {
        widgets.add(const SizedBox(height: 6));
        continue;
      }
      final label = _labelRe.firstMatch(line);
      final heading = _headingRe.firstMatch(line);
      final bullet = _bulletRe.firstMatch(line);
      final numbered = _numberedRe.firstMatch(line);
      final circled = _circledRe.firstMatch(line);
      final quote = _quoteRe.firstMatch(line);

      if (label != null) {
        widgets.add(Padding(
          padding: const EdgeInsets.only(top: 12, bottom: 4),
          child: Wrap(
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: 8,
            children: [
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                decoration: BoxDecoration(
                  color: AppColors.accentWash,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(label.group(1)!,
                    style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: AppColors.accentDeep)),
              ),
              if ((label.group(2) ?? '').isNotEmpty)
                ConstrainedBox(
                  constraints: BoxConstraints(
                      maxWidth: MediaQuery.of(context).size.width - 120),
                  child: RichText(
                      text: TextSpan(children: _inline(label.group(2)!, base))),
                ),
            ],
          ),
        ));
      } else if (heading != null) {
        widgets.add(Padding(
          padding: const EdgeInsets.only(top: 12, bottom: 4),
          child: Text(heading.group(1)!,
              style: const TextStyle(
                  fontSize: 15.5,
                  fontWeight: FontWeight.w700,
                  color: AppColors.accentDeep)),
        ));
      } else if (bullet != null) {
        widgets.add(_listRow(
          marker: _dotMarker(),
          content: bullet.group(1)!,
          base: base,
        ));
      } else if (numbered != null) {
        widgets.add(_listRow(
          marker: _indexMarker('${numbered.group(1)!}、', base),
          content: numbered.group(2)!,
          base: base,
        ));
      } else if (circled != null) {
        widgets.add(_listRow(
          marker: _indexMarker('${circled.group(1)!} ', base),
          content: circled.group(2)!,
          base: base,
        ));
      } else if (quote != null) {
        widgets.add(Container(
          margin: const EdgeInsets.symmetric(vertical: 6),
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
          decoration: const BoxDecoration(
            color: AppColors.accentWash,
            border: Border(left: BorderSide(color: AppColors.gold, width: 3)),
            borderRadius: BorderRadius.only(
                topRight: Radius.circular(10),
                bottomRight: Radius.circular(10)),
          ),
          child: RichText(
              text: TextSpan(
                  children: _inline(quote.group(1)!,
                      base.copyWith(color: AppColors.inkSoft)))),
        ));
      } else {
        widgets.add(Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: RichText(text: TextSpan(children: _inline(line, base))),
        ));
      }
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: widgets,
    );
  }

  Widget _dotMarker() {
    return Padding(
      padding: const EdgeInsets.only(top: 6, right: 8, left: 2),
      child: Container(
        width: 5,
        height: 5,
        decoration: const BoxDecoration(
            color: AppColors.accent, shape: BoxShape.circle),
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
            child: RichText(text: TextSpan(children: _inline(content, base))),
          ),
        ],
      ),
    );
  }
}
