/// 小爱回答正文解析：追问剥离、参考资料清理、流式安全截取（对齐 PWA `assistant_format.ts`）。
library;

final _followupSectionRe = RegExp(
  r'\n[ \t]*(?:###\s*相关追问|【相关追问】|\[相关追问\]|相关追问\s*[:：])',
);

final _trailingRefBlockRe = RegExp(
  r'\n[ \t]*(?:【参考资料】|参考资料\s*[:：]?)\s*(?:\n[ \t]*(?:\[\d{1,2}\]|［\d{1,2}］|【\d{1,2}】)[^\n]*)*\s*$',
);

final _orphanFootnoteRe = RegExp(
  r'\n+(\s*(?:(?:\[\d{1,2}\]|［\d{1,2}］|【\d{1,2}】|（\d{1,2}）)\s*)+)',
);

final _footnoteTokenRe = RegExp(
  r'(?:\[\d{1,2}\]|［\d{1,2}］|【\d{1,2}】|（\d{1,2}）)',
);

const _closers = '）」』》】"\'”’';

String stripFollowups(String text) {
  final idx = text.indexOf(_followupSectionRe);
  return idx >= 0 ? text.substring(0, idx).trim() : text.trim();
}

/// 归一化问题文本，用于去重比对。
String normalizeQuestion(String q) {
  return q
      .replaceAll(RegExp(r'\s+'), '')
      .replaceAll(RegExp(r'''[？?。！!，,、；;：:"'「」【】]'''), '')
      .toLowerCase();
}

String stripTrailingReferences(String text) {
  return text.replaceFirst(_trailingRefBlockRe, '').trimRight();
}

/// 把误拆到下一行的脚标并回上一行。
String joinOrphanFootnotes(String text) {
  return text.replaceAllMapped(_orphanFootnoteRe, (m) => m.group(1)!);
}

String bodyText(String text) =>
    joinOrphanFootnotes(stripTrailingReferences(stripFollowups(text)));

List<String> followupsOf(String text) {
  final m = _followupSectionRe.firstMatch(text);
  if (m == null) return const [];
  final tail = text.substring(m.start).split('\n').skip(1);
  final seen = <String>{};
  final out = <String>[];
  final re = RegExp(r'^\s*(?:[-*•]|\d+[.)、]|①|②|③|④|⑤)\s*(.+?)\s*$');
  for (final line in tail) {
    final match = re.firstMatch(line);
    if (match == null) continue;
    final q = match.group(1)!.replaceAll(RegExp(r'^["“]|["”]$'), '').trim();
    final key = normalizeQuestion(q);
    if (q.isEmpty || seen.contains(key)) continue;
    seen.add(key);
    out.add(q);
    if (out.length >= 3) break;
  }
  return out;
}

/// 句末软换行，便于阅读（对齐 PWA `softBreakSentences`）。
String softBreakSentences(String text) {
  var depth = 0;
  final out = StringBuffer();
  for (var i = 0; i < text.length; i++) {
    final ch = text[i];
    if (ch == '（' || ch == '(') depth += 1;
    if (ch == '）' || ch == ')') depth = depth > 0 ? depth - 1 : 0;
    out.write(ch);
    if (depth > 0) continue;
    if (ch != '。' && ch != '；' && ch != '！' && ch != '？') continue;
    if (i + 1 >= text.length) continue;
    final next = text[i + 1];
    if (next == '\n') continue;
    if (next == '[' || next == '［' || next == '【' || next == '（') continue;
    final ahead = text.substring(i + 1).trimLeft();
    if (_footnoteTokenRe.hasMatch(ahead)) continue;
    if (_closers.contains(next)) continue;
    out.write('\n');
  }
  return out.toString();
}

/// 合并被误拆到单独一行的闭合括号。
String joinOrphanClosers(String text) {
  return text
      .replaceAllMapped(
        RegExp(r'\n+[ \t]*([）\)」』》】]+)'),
        (m) => m.group(1)!,
      )
      .replaceAllMapped(
        RegExp(r'([（(【「『《])\n+'),
        (m) => m.group(1)!,
      );
}

bool _isStructuredLine(String line) {
  final t = line.trim();
  if (t.isEmpty) return true;
  if (RegExp(r'^#{1,6}\s').hasMatch(t)) return true;
  if (RegExp(r'^[-*+•·]\s').hasMatch(t)) return true;
  if (RegExp(r'^\d+[.、)）]\s').hasMatch(t)) return true;
  if (RegExp(r'^[①②③④⑤⑥⑦⑧⑨⑩]').hasMatch(t)) return true;
  if (t.startsWith('>')) return true;
  if (t.startsWith('|')) return true;
  if (RegExp(r'^---+$').hasMatch(t)) return true;
  if (t.startsWith('【') && t.contains('】')) return true;
  if (RegExp(
    r'^(?:###\s*相关追问|【相关追问】|\[相关追问\]|相关追问\s*[:：])',
  ).hasMatch(t)) {
    return true;
  }
  return false;
}

/// 将无 Markdown 结构的长段落拆成 2 句一段，提升扫读性。
String breakLongPlainBlocks(
  String text, {
  int maxSentences = 2,
  int minBreakLen = 72,
}) {
  final lines = text.split('\n');
  final out = <String>[];
  var i = 0;
  while (i < lines.length) {
    final line = lines[i];
    if (_isStructuredLine(line)) {
      out.add(line);
      i += 1;
      continue;
    }
    final plainLines = <String>[];
    while (i < lines.length &&
        !_isStructuredLine(lines[i]) &&
        lines[i].trim().isNotEmpty) {
      plainLines.add(lines[i]);
      i += 1;
    }
    final joined = joinOrphanClosers(plainLines.join('\n').trim());
    if (joined.isEmpty) continue;
    if (joined.length < minBreakLen ||
        !RegExp(r'[。；！？]').hasMatch(joined)) {
      out.add(joined);
      continue;
    }
    final sentences = softBreakSentences(joined)
        .split('\n')
        .map((s) => s.trim())
        .where((s) => s.isNotEmpty)
        .toList();
    if (sentences.length <= maxSentences) {
      out.add(joined);
      continue;
    }
    for (var j = 0; j < sentences.length; j += maxSentences) {
      final end = (j + maxSentences).clamp(0, sentences.length);
      out.add(sentences.sublist(j, end).join());
      if (end < sentences.length) out.add('');
    }
  }
  return out.join('\n');
}

/// 流式未完成时，仅隐藏半截【标签 / 裸 ###，完整标题照常显示。
String streamingSafeBody(String text) {
  final t = stripFollowups(text);
  final lines = t.split('\n');
  final last = lines.isEmpty ? '' : lines.last;
  final trimmed = last.trim();
  if (RegExp(r'^【[^】]*$').hasMatch(trimmed) ||
      RegExp(r'^###\s*$').hasMatch(trimmed)) {
    return lines.sublist(0, lines.length - 1).join('\n').trimRight();
  }
  return t;
}

/// 展示用正文：流式用安全截取，完成后用完整清洗 + 长段拆句（对齐 PWA `prepareAssistantMarkdown`）。
String prepareAssistantDisplay(String text, {required bool streaming}) {
  var raw = streaming ? streamingSafeBody(text) : bodyText(text);
  if (streaming) {
    raw = stripTrailingReferences(raw);
    raw = joinOrphanFootnotes(raw);
  } else {
    raw = breakLongPlainBlocks(raw);
  }
  return raw;
}
