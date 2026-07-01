/// 小爱输出的轻量富文本渲染：支持 【小标题】/ ## 标题 / **加粗** / 列表 / > 引用，
/// 增强可读性与视觉效果（对齐 H5 的 AnswerText）。
library;

import 'package:flutter/material.dart';

import '../../core/theme.dart';

class AnswerText extends StatelessWidget {
  const AnswerText({super.key, required this.text, this.fontSize = 15});
  final String text;
  final double fontSize;

  static final _labelRe = RegExp(r'^【([^】]+)】\s*(.*)$');
  static final _headingRe = RegExp(r'^#{1,4}\s+(.*)$');
  static final _bulletRe = RegExp(r'^\s*[-•·]\s+(.*)$');
  static final _numberedRe = RegExp(r'^\s*\d+[.、)]\s+(.*)$');
  static final _quoteRe = RegExp(r'^>\s?(.*)$');
  static final _boldRe = RegExp(r'\*\*([^*]+)\*\*');

  List<InlineSpan> _inline(String s, TextStyle base) {
    final spans = <InlineSpan>[];
    var last = 0;
    for (final m in _boldRe.allMatches(s)) {
      if (m.start > last) spans.add(TextSpan(text: s.substring(last, m.start)));
      spans.add(TextSpan(
        text: m.group(1),
        style: const TextStyle(
            fontWeight: FontWeight.w700, color: AppColors.accentDeep),
      ));
      last = m.end;
    }
    if (last < s.length) spans.add(TextSpan(text: s.substring(last)));
    return [TextSpan(style: base, children: spans)];
  }

  @override
  Widget build(BuildContext context) {
    final base = TextStyle(
        fontSize: fontSize, height: 1.78, color: AppColors.ink);
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
      } else if (bullet != null || numbered != null) {
        final content = (bullet ?? numbered)!.group(1)!;
        widgets.add(Padding(
          padding: const EdgeInsets.only(top: 2, bottom: 2),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.only(top: 6, right: 8, left: 2),
                child: Container(
                  width: 5,
                  height: 5,
                  decoration: const BoxDecoration(
                      color: AppColors.accent, shape: BoxShape.circle),
                ),
              ),
              Expanded(
                child: RichText(text: TextSpan(children: _inline(content, base))),
              ),
            ],
          ),
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
}
