/// 小爱 Markdown 预处理（对齐 Web `assistant_markdown.ts`）。
library;

import 'assistant_format.dart';

final _sectionLabelRe = RegExp(r'^【([^】]+)】\s*(.*)$');
final _followupHeadRe = RegExp(
  r'^[ \t]*(?:###\s*相关追问|【相关追问】|\[相关追问\]|相关追问\s*[:：])\s*$',
);

/// 将【摘要】等标签行提升为 Markdown 三级标题。
String promoteSectionLabels(String text) {
  return text
      .split('\n')
      .map((line) {
        final trimmed = line.trim();
        if (trimmed.isEmpty || _followupHeadRe.hasMatch(trimmed)) {
          return line;
        }
        final m = _sectionLabelRe.firstMatch(trimmed);
        if (m == null) return line;
        final label = m.group(1)!;
        final rest = m.group(2) ?? '';
        return rest.isNotEmpty ? '### $label\n\n$rest' : '### $label';
      })
      .join('\n');
}

/// 展示用 Markdown 正文（流式仅安全截取；完成后完整清洗 + 分段）。
String prepareAssistantMarkdown(String text, {required bool streaming}) {
  var raw = streaming ? streamingSafeBody(text) : bodyText(text);
  if (streaming) {
    raw = stripTrailingReferences(raw);
    raw = joinOrphanFootnotes(raw);
    return raw;
  }
  raw = promoteSectionLabels(raw);
  return breakLongPlainBlocks(raw);
}

/// 半屏解读折叠态：提取摘要首句（兼容 Markdown 与旧【摘要】）。
({String summary, String body}) extractSummaryLead(String text) {
  final md = RegExp(r'(?:^|\n)###\s*摘要\s*\n+([^\n#]+)').firstMatch(text);
  if (md != null) {
    final summary = md.group(1)!.trim();
    final body = text
        .replaceFirst(RegExp(r'(?:^|\n)###\s*摘要\s*\n+[^\n#]+'), '')
        .trim();
    return (summary: summary, body: body);
  }
  final legacy = RegExp(r'【摘要】\s*([^\n【]+)').firstMatch(text);
  if (legacy != null) {
    final summary = legacy.group(1)!.trim();
    final body = text.replaceFirst(RegExp(r'【摘要】\s*[^\n【]+'), '').trim();
    return (summary: summary, body: body);
  }
  return (summary: '', body: text);
}

int? parseCitationHref(String? href) {
  final m = RegExp(r'^#cite-(\d{1,2})$').firstMatch(href ?? '');
  return m != null ? int.tryParse(m.group(1)!) : null;
}

/// 与 [prepareAssistantMarkdown] 同义，供旧调用方使用。
String prepareAssistantDisplay(String text, {required bool streaming}) =>
    prepareAssistantMarkdown(text, streaming: streaming);
