/// 书架正文 HTML 预处理（对话说话人、继续对话问题）。
library;

final _dialogueParaRe = RegExp(
  r'<p class="shelf-dialogue">(信徒|牧者)[：:]\s*(.*?)</p>',
  dotAll: true,
);

String prepareShelfProseHtml(String html) {
  if (html.trim().isEmpty) return html;

  var out = html.replaceAllMapped(_dialogueParaRe, (m) {
    final speaker = m.group(1)!;
    final body = m.group(2)!;
    return '<p class="shelf-dialogue">'
        '<span class="shelf-dialogue-speaker">$speaker</span>：'
        '<span class="shelf-dialogue-text">$body</span></p>';
  });

  final parts = out.split('</p>');
  final rebuilt = <String>[];
  var inQuestions = false;
  for (final chunk in parts) {
    if (chunk.isEmpty) continue;
    final piece = '$chunk</p>';
    if (piece.contains('class="shelf-body">继续对话的问题</p>') ||
        piece.contains("class='shelf-body'>继续对话的问题</p>")) {
      rebuilt.add(piece.replaceFirst('class="shelf-body"', 'class="shelf-dialogue-q-head"'));
      inQuestions = true;
      continue;
    }
    if (inQuestions && piece.contains('class="shelf-body"')) {
      rebuilt.add(piece.replaceFirst('class="shelf-body"', 'class="shelf-dialogue-q"'));
      continue;
    }
    if (inQuestions && !piece.contains('class="shelf-body"')) {
      inQuestions = false;
    }
    rebuilt.add(piece);
  }
  return rebuilt.join();
}

final _layoutStyleKeys = {
  'margin-left',
  'margin-right',
  'margin-top',
  'margin-bottom',
  'margin',
  'padding-left',
  'padding-right',
  'padding-top',
  'padding-bottom',
  'padding',
  'width',
  'max-width',
  'min-width',
  'text-indent',
  'left',
  'right',
  'top',
  'float',
  'position',
};

final _stripStyleKeys = (
  'font-size',
  'font-family',
  'line-height',
  'color',
  'letter-spacing',
  'mso-',
);

final _styleAttrRe = RegExp(r'\sstyle="([^"]*)"', caseSensitive: false);
final _dimAttrRe = RegExp(r'\s(?:width|height|align|valign)="[^"]*"', caseSensitive: false);
final _simpleDivRe = RegExp(
  r'<div\b([^>]*)>(.*?)</div>',
  caseSensitive: false,
  dotAll: true,
);
final _blockInsideRe = RegExp(r'<\s*(table|ul|ol|h[1-4]|blockquote|img)\b', caseSensitive: false);

String _stripInlineLayoutStyle(String style) {
  final parts = <String>[];
  for (final part in style.split(';')) {
    final trimmed = part.trim();
    if (trimmed.isEmpty) continue;
    final key = trimmed.split(':').first.trim().toLowerCase();
    if (_layoutStyleKeys.contains(key)) continue;
    if (_stripStyleKeys.any(key.startsWith)) continue;
    parts.add(trimmed);
  }
  return parts.join('; ');
}

String _cleanTagAttrs(String attrs) {
  var out = attrs;
  out = out.replaceAllMapped(_styleAttrRe, (m) {
    final cleaned = _stripInlineLayoutStyle(m.group(1)!);
    return cleaned.isEmpty ? '' : ' style="$cleaned"';
  });
  out = out.replaceAll(_dimAttrRe, '');
  return out;
}

String _flattenSimpleDivs(String html) {
  var out = html;
  for (var i = 0; i < 32; i++) {
    var changed = false;
    out = out.replaceAllMapped(_simpleDivRe, (m) {
      final attrs = m.group(1) ?? '';
      if (attrs.contains('shelf-docx-table-wrap')) return m.group(0)!;
      final body = (m.group(2) ?? '').trim();
      if (body.isEmpty) {
        changed = true;
        return '';
      }
      if (_blockInsideRe.hasMatch(body)) return m.group(0)!;
      changed = true;
      if (body.contains('shelf-docx-')) return body;
      return '<p class="shelf-docx-p">$body</p>';
    });
    if (!changed) break;
  }
  return out;
}

/// Word/Mammoth 残留 margin/width 与嵌套 div 会导致正文列变窄，右侧留空。
String prepareShelfDocxLayoutHtml(String html) {
  if (html.trim().isEmpty) return html;
  var out = _flattenSimpleDivs(html);
  out = out.replaceAllMapped(_styleAttrRe, (m) {
    final cleaned = _stripInlineLayoutStyle(m.group(1)!);
    return cleaned.isEmpty ? '' : ' style="$cleaned"';
  });
  out = out.replaceAll(_dimAttrRe, '');
  return out;
}
