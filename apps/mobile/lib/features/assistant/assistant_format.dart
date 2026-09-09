/// 小爱回答正文解析：追问剥离、参考资料清理、流式安全截取（对齐 PWA `assistant_format.ts`）。
library;

import 'assistant_scenes.dart';
import 'assistant_output_plan.dart';
import 'models.dart' show Citation;

export 'assistant_markdown.dart'
    show extractSummaryLead, prepareAssistantDisplay, prepareAssistantMarkdown;

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

/// 失败 / 中断 / 空答 — 不应进入多轮 history。
bool isAssistantHistoryExcluded(String text) {
  final t = text.trim();
  if (t.isEmpty) return true;
  if (t.startsWith('⚠️')) return true;
  if (t == '（已停止生成）' || t.contains('已停止生成')) return true;
  if (t.contains('生成未完成')) return true;
  return false;
}

/// 流未正常结束时追加轻提示（对齐 PWA `appendStreamIncompleteNotice`）。
String appendStreamIncompleteNotice(String acc) {
  final trimmed = acc.trim();
  if (trimmed.isEmpty || trimmed.startsWith('⚠️')) return trimmed;
  if (trimmed.contains('生成未完成')) return trimmed;
  return '$trimmed\n\n（生成未完成，可点重新生成）';
}

/// 正文展示是否剥离了追问区或末尾参考资料。
bool assistantDisplayTrimmed(String raw) {
  final t = raw.trim();
  if (t.isEmpty) return false;
  if (_followupSectionRe.hasMatch(t)) return true;
  return _trailingRefBlockRe.hasMatch(t);
}

const _verseFullSections = ['摘要', '背景', '经文解释'];
const _verseQuickSections = ['摘要', '经文解释'];

Set<String> _sectionTitles(String text) {
  final titles = <String>{};
  for (final m in RegExp(r'^###\s+(.+)$', multiLine: true).allMatches(text)) {
    final t = m.group(1)?.trim();
    if (t != null && t.isNotEmpty && t != '相关追问') titles.add(t);
  }
  for (final m in RegExp(r'【([^】]+)】').allMatches(text)) {
    final t = m.group(1)?.trim();
    if (t != null && t.isNotEmpty && t != '相关追问') titles.add(t);
  }
  return titles;
}

/// 从 OSIS ref 末段解析选区节数（如 1CO.6.1-11 → 11）。
int verseSpanFromRef(String ref) {
  final parts = ref.trim().split('.');
  if (parts.isEmpty) return 1;
  final tail = parts.last;
  final m = RegExp(r'^(\d+)(?:-(\d+))?$').firstMatch(tail);
  if (m == null) return 1;
  final start = int.tryParse(m.group(1) ?? '') ?? 1;
  final end = int.tryParse(m.group(2) ?? m.group(1) ?? '') ?? start;
  return (end - start + 1).clamp(1, 999);
}

/// 半屏解读是否完整（对齐 PWA；有 outputPlan 时按 depth 计划小节判定）。
bool isHalfSheetAnswerComplete(
  String answer,
  AssistantScene scene, [
  int verseSpan = 1,
  OutputPlan? outputPlan,
]) {
  final text = answer.trim();
  if (text.isEmpty || text.startsWith('⚠️')) return false;

  if (outputPlan != null && outputPlan.sections.isNotEmpty) {
    final minLen = outputPlan.minComplete ?? 60;
    if (text.length < minLen) return false;
    final titles = _sectionTitles(text);
    for (final sec in outputPlan.sections) {
      if (sec == '经文背景' || sec == '背景') {
        if (!titles.contains('经文背景') && !titles.contains('背景')) {
          return false;
        }
      } else if (!titles.contains(sec)) {
        return false;
      }
    }
    return true;
  }

  final titles = _sectionTitles(text);
  final span = verseSpan.clamp(1, 999);
  final minLen = switch (scene) {
    AssistantScene.verseFull => span <= 2
        ? 70
        : span <= 5
            ? 90 + (span - 2).clamp(0, 99) * 15
            : 140 + span * 22,
    AssistantScene.verseQuick => span <= 2
        ? 45
        : span <= 5
            ? 55 + (span - 2).clamp(0, 99) * 12
            : 55 + (span - 1) * 18,
    _ => 80,
  };
  if (text.length < minLen) return false;
  switch (scene) {
    case AssistantScene.verseFull:
      if (!titles.contains('摘要') || !titles.contains('经文解释')) {
        return false;
      }
      if (!titles.contains('经文背景') && !titles.contains('背景')) {
        return false;
      }
      if (span >= 6 && !titles.contains('段落脉络')) return false;
      return true;
    case AssistantScene.verseQuick:
      return _verseQuickSections.every(titles.contains);
    default:
      return true;
  }
}

/// FAB 无选区时选区不参与 cache key / 问句，仅 ref + scene。
String halfSheetCacheSelection(String selection, bool explicitSelection) {
  if (!explicitSelection) return '';
  return selection.trim();
}

/// 半屏 API 问句：长选区不拼进 prompt，经文由 ref 在后端展开。
String buildHalfSheetQuestion(
  String userQuestion,
  String selection, [
  bool explicitSelection = true,
]) {
  final sel = halfSheetCacheSelection(selection, explicitSelection);
  if (sel.isEmpty || sel.length > 300) return userQuestion;
  return '$userQuestion\n\n选中文本：$sel';
}

/// 回答正文中实际引用的脚注（无 [n] 标记则返回全部）。
List<Citation> citationsUsedInText(String text, List<Citation> citations) {
  if (citations.isEmpty) return const [];
  final used = citations.where((c) => text.contains('[${c.n}]')).toList();
  return used.isNotEmpty ? used : citations;
}

/// Chip 追问展示字数上限（与 prompts / parse_output 对齐）
const maxFollowupLabelLen = 24;

String compactFollowupLabel(String q) {
  var s = q.trim().replaceAll(RegExp(r'^["“]|["”]$'), '');
  s = s.replaceFirst(RegExp(r'^(请|能否|是否可以|可以|麻烦|想要)'), '').trim();
  const maxLen = maxFollowupLabelLen;
  if (s.length > maxLen) {
    var cut = s.substring(0, maxLen);
    for (var i = cut.length - 1; i >= cut.length - 6 && i >= 5; i--) {
      if ('，、；：'.contains(cut[i])) {
        cut = cut.substring(0, i);
        break;
      }
    }
    s = '${cut.replaceAll(RegExp(r'[，,、；;：:]+$'), '')}…';
  }
  return s.trim();
}

List<String> normalizeFollowupItems(List<String> items) {
  final seen = <String>{};
  final out = <String>[];
  for (final raw in items) {
    final q = compactFollowupLabel(raw);
    final key = normalizeQuestion(q);
    if (q.isEmpty || seen.contains(key)) continue;
    seen.add(key);
    out.add(q);
    if (out.length >= 3) break;
  }
  return out;
}

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
    final q = compactFollowupLabel(
      match.group(1)!.replaceAll(RegExp(r'^["“]|["”]$'), '').trim(),
    );
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
