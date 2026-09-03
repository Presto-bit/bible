/// 书架正文 HTML 预处理（对话说话人、继续对话问题、经文 linkify）。
library;

import '../../bible/inline_ref.dart';

final _dialogueParaRe = RegExp(
  r'<p class="shelf-dialogue">(信徒|牧者)[：:]\s*(.*?)</p>',
  dotAll: true,
);

final _speakerLineRe = RegExp(r'^(信徒|牧者)[：:]\s*(.*)$', dotAll: true);

final _anyParaRe = RegExp(r'<p([^>]*)>(.*?)</p>', dotAll: true);

String _tagDialogueParagraphs(String html) {
  return html.replaceAllMapped(_anyParaRe, (m) {
    final attrs = m.group(1)!;
    if (attrs.contains('shelf-dialogue') ||
        attrs.contains('shelf-dialogue-q') ||
        attrs.contains('shelf-dialogue-q-head')) {
      return m.group(0)!;
    }
    final plain = m
        .group(2)!
        .replaceAll(RegExp(r'<[^>]+>'), '')
        .replaceAll('\u00a0', ' ')
        .trim();
    if (!_speakerLineRe.hasMatch(plain)) return m.group(0)!;
    return '<p class="shelf-dialogue">${m.group(2)!}</p>';
  });
}

String _enhanceDialogueParagraphs(String html) {
  return html.replaceAllMapped(_dialogueParaRe, (m) {
    final speaker = m.group(1)!;
    final body = m.group(2)!;
    return '<p class="shelf-dialogue">'
        '<span class="shelf-dialogue-speaker">$speaker</span>：'
        '<span class="shelf-dialogue-text">$body</span></p>';
  });
}

String _enhanceDialogueQuestions(String html) {
  final parts = html.split('</p>');
  final rebuilt = <String>[];
  var inQuestions = false;
  for (final chunk in parts) {
    if (chunk.isEmpty) continue;
    var piece = '$chunk</p>';
    final plain = piece.replaceAll(RegExp(r'<[^>]+>'), '').replaceAll(RegExp(r'\s+'), '');
    if (plain == '继续对话的问题') {
      rebuilt.add('<p class="shelf-dialogue-q-head">继续对话的问题</p>');
      inQuestions = true;
      continue;
    }
    if (inQuestions) {
      if (piece.contains('shelf-h1') || piece.contains('shelf-docx-h1')) {
        inQuestions = false;
        rebuilt.add(piece);
        continue;
      }
      if (piece.contains('shelf-dialogue-q-head')) {
        inQuestions = false;
        rebuilt.add(piece);
        continue;
      }
      final line = piece.replaceAll(RegExp(r'<[^>]+>'), '').replaceAll('\u00a0', ' ').trim();
      if (line.isEmpty) {
        rebuilt.add(piece);
        continue;
      }
      if (_speakerLineRe.hasMatch(line)) {
        inQuestions = false;
        rebuilt.add(piece);
        continue;
      }
      if (piece.contains('class="')) {
        piece = piece.replaceFirst(RegExp(r'class="[^"]*"'), 'class="shelf-dialogue-q"');
      } else if (piece.contains("class='")) {
        piece = piece.replaceFirst(RegExp(r"class='[^']*'"), "class='shelf-dialogue-q'");
      } else {
        piece = piece.replaceFirst('<p>', '<p class="shelf-dialogue-q">');
      }
      rebuilt.add(piece);
      continue;
    }
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
    rebuilt.add(piece);
  }
  return rebuilt.join();
}

String prepareShelfProseHtml(String html) {
  if (html.trim().isEmpty) return html;
  var out = _tagDialogueParagraphs(html);
  out = _enhanceDialogueParagraphs(out);
  out = _enhanceDialogueQuestions(out);
  return out;
}

String _escapeHtml(String text) {
  return text
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
}

String _linkifyPlainText(String text) {
  final parts = splitInlineRefs(text);
  if (parts.length == 1 && parts.first.kind == InlineRefKind.text) return _escapeHtml(text);
  return parts.map((p) {
    if (p.kind == InlineRefKind.text) return _escapeHtml(p.value);
    final osis = _escapeHtml(p.osis ?? '');
    final label = _escapeHtml(p.value);
    return '<a href="shelf-ref:$osis" class="shelf-inline-ref" data-label="$label">$label</a>';
  }).join();
}

String _linkifyPlainTextInHtml(String html) {
  final out = StringBuffer();
  var i = 0;
  while (i < html.length) {
    if (html[i] == '<') {
      final gt = html.indexOf('>', i);
      if (gt < 0) break;
      out.write(html.substring(i, gt + 1));
      i = gt + 1;
      continue;
    }
    final nextTag = html.indexOf('<', i);
    final textEnd = nextTag < 0 ? html.length : nextTag;
    final chunk = html.substring(i, textEnd);
    out.write(_linkifyPlainText(chunk));
    i = textEnd;
  }
  return out.toString();
}

/// 段落锚点：竖滚续读比 scroll 比例更稳（对齐 Web / API html_normalize）。
String injectShelfParagraphAnchors(String html) {
  var idx = 0;
  return html.replaceAllMapped(
    RegExp(
      r'<p(\s[^>]*class="[^"]*(?:shelf-body|shelf-docx-p|shelf-dialogue)[^"]*"[^>]*)>',
    ),
    (m) {
      final full = m.group(0)!;
      if (full.contains('data-shelf-p=')) return full;
      final injected = full.replaceFirst('>', ' data-shelf-p="$idx">');
      idx += 1;
      return injected;
    },
  );
}

/// 对话增强 + 段落锚点 + 经文 linkify（对齐 Web linkifyShelfProseHtml）。
String linkifyShelfProseHtml(String html) {
  if (html.trim().isEmpty) return html;
  var out = prepareShelfProseHtml(html);
  out = injectShelfParagraphAnchors(out);
  out = _linkifyPlainTextInHtml(out);
  return out;
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
      if (attrs.contains('shelf-docx-table-wrap') ||
          attrs.contains('shelf-docx-root') ||
          attrs.contains('shelf-docx-gallery') ||
          attrs.contains('shelf-epub-root')) {
        return m.group(0)!;
      }
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

/// API 抽出的 Word 内嵌图 src 为 `/shelf/platform/...` 或裸文件名，补成绝对地址。
String rewriteShelfHtmlAssetUrls(
  String html,
  String baseUrl, {
  String? bookId,
}) {
  if (html.isEmpty) return html;
  final base = baseUrl.replaceAll(RegExp(r'/$'), '');
  var out = html.replaceAllMapped(
    RegExp(r'''((?:src|href)=)(["'])(/shelf/platform/[^"']+)\2''', caseSensitive: false),
    (m) => '${m[1]}${m[2]}$base${m[3]}${m[2]}',
  );
  if (bookId != null && bookId.isNotEmpty) {
    out = out.replaceAllMapped(
      RegExp(
        r'''((?:src|href)=)(["'])(?!https?://|data:)([^"']+\.(?:png|jpe?g|webp|gif|bmp))\2''',
        caseSensitive: false,
      ),
      (m) {
        final raw = m.group(3)!;
        if (raw.startsWith('/')) return '${m[1]}${m[2]}$base$raw${m[2]}';
        final key = raw.split('/').last;
        final bid = Uri.encodeComponent(bookId);
        final file = Uri.encodeComponent(key);
        return '${m[1]}${m[2]}$base/shelf/platform/$bid/files/$file${m[2]}';
      },
    );
  }
  return out;
}
