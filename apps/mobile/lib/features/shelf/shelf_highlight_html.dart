/// 书架划线：在 HTML 中注入 mark 背景（flutter_html 渲染）。
library;

import 'package:flutter/material.dart';

import '../bible/reader_marking_models.dart';

String applyShelfHighlightsToHtml(
  String html,
  Map<String, HighlightMark> marks,
  String bookId,
  String sectionId,
) {
  if (marks.isEmpty || html.isEmpty) return html;

  final ranges = <(int, int, String)>[];
  for (final entry in marks.entries) {
    final ref = entry.key;
    if (!ref.startsWith('SHELF.$bookId.$sectionId.')) continue;
    final span = _parseSpan(ref);
    if (span == null) continue;
    final start = span.$1;
    final end = span.$2;
    if (start < 0 || end <= start) continue;
    ranges.add((start, end, _colorHex(chipColor(entry.value.color))));
  }
  if (ranges.isEmpty) return html;
  ranges.sort((a, b) => b.$1.compareTo(a.$1));

  var out = html;
  for (final (start, end, hex) in ranges) {
    out = _wrapPlainRange(out, start, end, hex);
  }
  return out;
}

String _wrapPlainRange(String html, int start, int end, String hex) {
  final out = StringBuffer();
  var plain = 0;
  var i = 0;
  var markOpen = false;

  void closeMark() {
    if (markOpen) {
      out.write('</mark>');
      markOpen = false;
    }
  }

  void openMark() {
    if (!markOpen) {
      out.write('<mark class="shelf-hl" style="background-color:$hex">');
      markOpen = true;
    }
  }

  while (i < html.length) {
    if (html.startsWith('<mark', i) || html.startsWith('</mark>', i)) {
      final gt = html.indexOf('>', i);
      if (gt < 0) break;
      i = gt + 1;
      continue;
    }
    if (html[i] == '<') {
      closeMark();
      final gt = html.indexOf('>', i);
      if (gt < 0) break;
      out.write(html.substring(i, gt + 1));
      i = gt + 1;
      continue;
    }

    final entityLen = _readEntityLen(html, i);
    if (entityLen > 0) {
      if (plain >= end) closeMark();
      else if (plain >= start) openMark();
      else closeMark();
      out.write(html.substring(i, i + entityLen));
      plain += 1;
      i += entityLen;
      continue;
    }

    if (plain >= end) closeMark();
    else if (plain >= start) openMark();
    else closeMark();
    out.write(html[i]);
    plain += 1;
    i += 1;
  }
  closeMark();
  return out.toString();
}

int _readEntityLen(String html, int i) {
  if (html[i] != '&') return 0;
  final semi = html.indexOf(';', i);
  if (semi <= i) return 0;
  final ent = html.substring(i, semi + 1);
  if (ent == '&nbsp;' || ent == '&amp;' || ent == '&lt;' || ent == '&gt;') {
    return ent.length;
  }
  return 0;
}

(int, int)? _parseSpan(String ref) {
  final at = ref.indexOf('@');
  if (at < 0) return null;
  final part = ref.substring(at + 1);
  final dash = part.indexOf('-');
  if (dash <= 0) return null;
  final start = int.tryParse(part.substring(0, dash));
  final end = int.tryParse(part.substring(dash + 1));
  if (start == null || end == null) return null;
  return (start, end);
}

String _colorHex(Color c) {
  return '#${c.toARGB32().toRadixString(16).padLeft(8, '0').substring(2)}';
}
