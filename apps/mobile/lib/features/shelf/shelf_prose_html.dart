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
