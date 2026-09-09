/// 阅读显示层引号：直角「」→ 弯引号 ""（不改经文数据）。
library;

enum QuoteDisplayMode { source, western }

extension QuoteDisplayModeX on QuoteDisplayMode {
  String get label => switch (this) {
    QuoteDisplayMode.source => '直角引号',
    QuoteDisplayMode.western => '弯引号',
  };

  String get hint => switch (this) {
    QuoteDisplayMode.source => '与纸书经文一致（「」『』）',
    QuoteDisplayMode.western => '仅阅读显示为 “”‘’，复制仍为原文',
  };
}

const _cornerToWestern = {
  '「': '\u201C',
  '」': '\u201D',
  '『': '\u2018',
  '』': '\u2019',
};

QuoteDisplayMode parseQuoteDisplayMode(String? raw) {
  if (raw == 'western') return QuoteDisplayMode.western;
  return QuoteDisplayMode.source;
}

String formatQuotesForDisplay(String text, QuoteDisplayMode mode) {
  if (mode != QuoteDisplayMode.western || text.isEmpty) return text;
  if (!text.contains('「') &&
      !text.contains('」') &&
      !text.contains('『') &&
      !text.contains('』')) {
    return text;
  }
  final buf = StringBuffer();
  for (final rune in text.runes) {
    final ch = String.fromCharCode(rune);
    buf.write(_cornerToWestern[ch] ?? ch);
  }
  return buf.toString();
}
