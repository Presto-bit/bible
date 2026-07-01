/// 小爱（AI 释经）模型。
library;

/// 五种模式（与后端 ai/prompts MODES 对齐）。
enum AssistantMode {
  understand('understand', '读懂经文'),
  explain('explain', '释经解释'),
  apply('apply', '默想应用'),
  compare('compare', '译本对照'),
  original('original', '原文释义');

  const AssistantMode(this.id, this.label);
  final String id;
  final String label;
}

/// 引用脚注。
class Citation {
  Citation({required this.n, required this.title, required this.score});
  final int n;
  final String title;
  final double score;

  factory Citation.fromJson(Map<String, dynamic> j) => Citation(
        n: (j['n'] ?? 0) as int,
        title: (j['title'] ?? '') as String,
        score: ((j['score'] ?? 0) as num).toDouble(),
      );
}

/// meta 事件载荷。
class ChatMeta {
  ChatMeta({
    required this.mode,
    required this.modeLabel,
    required this.display,
    required this.citations,
    required this.quotaUsed,
    required this.quotaLimit,
  });

  final String mode;
  final String modeLabel;
  final String display;
  final List<Citation> citations;
  final int quotaUsed;
  final int quotaLimit;

  factory ChatMeta.fromJson(Map<String, dynamic> j) {
    final q = (j['quota'] ?? const {}) as Map<String, dynamic>;
    return ChatMeta(
      mode: (j['mode'] ?? '') as String,
      modeLabel: (j['mode_label'] ?? '') as String,
      display: (j['display'] ?? '') as String,
      citations: ((j['citations'] ?? []) as List)
          .map((e) => Citation.fromJson(e as Map<String, dynamic>))
          .toList(),
      quotaUsed: (q['used'] ?? 0) as int,
      quotaLimit: (q['limit'] ?? 0) as int,
    );
  }
}

/// 流式事件（meta / delta / done / error）。
sealed class ChatEvent {
  const ChatEvent();
}

class MetaEvent extends ChatEvent {
  const MetaEvent(this.meta);
  final ChatMeta meta;
}

class DeltaEvent extends ChatEvent {
  const DeltaEvent(this.text);
  final String text;
}

class DoneEvent extends ChatEvent {
  const DoneEvent(this.length);
  final int length;
}

class ErrorEvent extends ChatEvent {
  const ErrorEvent(this.message);
  final String message;
}

/// 一轮对话（本地持有，用于多轮 history 与 UI 渲染）。
class ChatTurn {
  ChatTurn({required this.role, required this.content, this.meta});
  final String role; // user / assistant
  String content;
  ChatMeta? meta;
}
