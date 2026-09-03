/// 书架竖滚续读锚点（段落级，改字号后比 scroll 比例更稳）。
library;

import 'shelf_mark_ref.dart';

class ShelfScrollAnchor {
  const ShelfScrollAnchor({
    required this.paragraphIndex,
    this.viewportFromTop = 0,
  });

  final int paragraphIndex;
  final double viewportFromTop;

  Map<String, dynamic> toJson() => {
        'paragraphIndex': paragraphIndex,
        'viewportFromTop': viewportFromTop.clamp(0.0, 1.0),
      };

  static ShelfScrollAnchor? fromJson(Object? raw) {
    if (raw is! Map) return null;
    final idx = raw['paragraphIndex'];
    if (idx is! num) return null;
    final vf = raw['viewportFromTop'];
    return ShelfScrollAnchor(
      paragraphIndex: idx.toInt().clamp(0, 99999),
      viewportFromTop: vf is num ? vf.toDouble().clamp(0.0, 1.0) : 0,
    );
  }
}

final _pTagRe = RegExp(
  r'<p\b[^>]*data-shelf-p="(\d+)"[^>]*>',
  caseSensitive: false,
);

/// 段落锚点在纯文本中的起始偏移（升序）。
List<int> shelfParagraphPlainOffsets(String html) {
  final plain = plainTextFromHtml(html);
  if (plain.isEmpty) return const [0];

  final offsets = <int>[0];
  var cursor = 0;
  for (final m in _pTagRe.allMatches(html)) {
    final idx = int.tryParse(m.group(1) ?? '') ?? offsets.length - 1;
    while (offsets.length <= idx) {
      offsets.add(cursor);
    }
    if (idx < offsets.length) {
      offsets[idx] = cursor;
    }
    final end = m.end;
    final close = html.indexOf('</p>', end);
    if (close < 0) continue;
    final frag = html.substring(end, close);
    cursor += plainTextFromHtml(frag).length;
    if (cursor < plain.length) {
      cursor += 1;
    }
  }
  return offsets;
}

int shelfParagraphIndexForRatio(String html, double ratio) {
  final plain = plainTextFromHtml(html);
  if (plain.isEmpty) return 0;
  final offsets = shelfParagraphPlainOffsets(html);
  if (offsets.length <= 1) return 0;
  final charPos = (ratio.clamp(0.0, 1.0) * plain.length).round();
  var pick = 0;
  for (var i = 0; i < offsets.length; i++) {
    if (offsets[i] <= charPos) pick = i;
  }
  return pick;
}

double shelfRatioForParagraphIndex(String html, int paragraphIndex) {
  final plain = plainTextFromHtml(html);
  if (plain.isEmpty) return 0;
  final offsets = shelfParagraphPlainOffsets(html);
  if (offsets.isEmpty) return 0;
  final idx = paragraphIndex.clamp(0, offsets.length - 1);
  return (offsets[idx] / plain.length).clamp(0.0, 1.0);
}
