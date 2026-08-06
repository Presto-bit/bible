/// 对照译本措辞差异（轻量 LCS，对齐 Web `verse_diff.ts`）。
library;

enum DiffSide { main, parallel }

class DiffSpan {
  const DiffSpan({required this.start, required this.end, required this.side});
  final int start;
  final int end;
  final DiffSide side;
}

class VerseDiffResult {
  const VerseDiffResult({
    required this.main,
    required this.parallel,
    required this.heavy,
  });
  final List<DiffSpan> main;
  final List<DiffSpan> parallel;
  final bool heavy;
}

const _maxSpans = 40;
final _punctRe = RegExp(
  r'''[\s\u3000，。！？、；：""''（）【】《》…—\-\.,!?;:'"\(\)\[\]{}]''',
);

String? _normalizeChar(String ch) {
  if (_punctRe.hasMatch(ch)) return null;
  return ch;
}

({List<String> chars, List<int> indexMap}) _tokenize(String text) {
  final chars = <String>[];
  final indexMap = <int>[];
  final runes = text.runes.toList();
  var i = 0;
  for (final r in runes) {
    final ch = String.fromCharCode(r);
    final n = _normalizeChar(ch);
    if (n != null) {
      chars.add(n);
      indexMap.add(i);
    }
    i += ch.length;
  }
  return (chars: chars, indexMap: indexMap);
}

({List<bool> aKeep, List<bool> bKeep}) _lcsMask(List<String> a, List<String> b) {
  final n = a.length;
  final m = b.length;
  if (n * m > 12000) {
    return (
      aKeep: List.filled(n, true),
      bKeep: List.filled(m, true),
    );
  }
  final dp = List.generate(n + 1, (_) => List<int>.filled(m + 1, 0));
  for (var i = 1; i <= n; i++) {
    for (var j = 1; j <= m; j++) {
      dp[i][j] = a[i - 1] == b[j - 1]
          ? dp[i - 1][j - 1] + 1
          : (dp[i - 1][j] > dp[i][j - 1] ? dp[i - 1][j] : dp[i][j - 1]);
    }
  }
  final aKeep = List.filled(n, false);
  final bKeep = List.filled(m, false);
  var i = n;
  var j = m;
  while (i > 0 && j > 0) {
    if (a[i - 1] == b[j - 1]) {
      aKeep[i - 1] = true;
      bKeep[j - 1] = true;
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  return (aKeep: aKeep, bKeep: bKeep);
}

List<DiffSpan> _maskToSpans(
  List<bool> keep,
  List<int> indexMap,
  DiffSide side,
) {
  final spans = <DiffSpan>[];
  var i = 0;
  while (i < keep.length) {
    if (keep[i]) {
      i++;
      continue;
    }
    final startTok = i;
    while (i < keep.length && !keep[i]) {
      i++;
    }
    final endTok = i - 1;
    spans.add(DiffSpan(
      start: indexMap[startTok],
      end: indexMap[endTok] + 1,
      side: side,
    ));
  }
  return spans;
}

VerseDiffResult diffVerseTexts(String mainText, String parallelText) {
  final a = _tokenize(mainText);
  final b = _tokenize(parallelText);
  if (a.chars.isEmpty || b.chars.isEmpty) {
    return const VerseDiffResult(main: [], parallel: [], heavy: false);
  }
  if (a.chars.length * b.chars.length > 12000) {
    return const VerseDiffResult(main: [], parallel: [], heavy: true);
  }
  final mask = _lcsMask(a.chars, b.chars);
  var main = _maskToSpans(mask.aKeep, a.indexMap, DiffSide.main);
  var parallel = _maskToSpans(mask.bKeep, b.indexMap, DiffSide.parallel);
  final heavy = main.length + parallel.length > _maxSpans;
  if (heavy) {
    main = [];
    parallel = [];
  }
  return VerseDiffResult(main: main, parallel: parallel, heavy: heavy);
}

final _memCache = <String, VerseDiffResult>{};
const _memMax = 240;

VerseDiffResult cachedVerseDiff(
  String key,
  String mainText,
  String parallelText,
) {
  final hit = _memCache[key];
  if (hit != null) return hit;
  final result = diffVerseTexts(mainText, parallelText);
  if (_memCache.length >= _memMax) {
    _memCache.remove(_memCache.keys.first);
  }
  _memCache[key] = result;
  return result;
}

bool sameScriptRoughly(String a, String b) {
  final cjkA = RegExp(r'[\u4e00-\u9fff]').hasMatch(a);
  final cjkB = RegExp(r'[\u4e00-\u9fff]').hasMatch(b);
  return cjkA == cjkB;
}

List<({String text, bool diff})> renderTextWithDiffSpans(
  String text,
  List<DiffSpan> spans,
) {
  if (spans.isEmpty) return [(text: text, diff: false)];
  final sorted = [...spans]..sort((x, y) => x.start.compareTo(y.start));
  final parts = <({String text, bool diff})>[];
  var cursor = 0;
  for (var idx = 0; idx < sorted.length; idx++) {
    final s = sorted[idx];
    if (s.start > cursor) {
      parts.add((text: text.substring(cursor, s.start), diff: false));
    }
    parts.add((
      text: text.substring(s.start, s.end.clamp(0, text.length)),
      diff: true,
    ));
    cursor = s.end;
  }
  if (cursor < text.length) {
    parts.add((text: text.substring(cursor), diff: false));
  }
  return parts.where((p) => p.text.isNotEmpty).toList();
}
