/// 流式是否已有可见正文（有内容即隐藏思考行）。
library;

import 'assistant_format.dart';

bool hasVisibleAnswerContent(String text, {int minChars = 8}) {
  final t = bodyText(text).trim();
  if (t.length >= minChars) return true;
  return RegExp(r'(?:^|\n)###\s+\S+\s*\n+\S', multiLine: true).hasMatch(t);
}
