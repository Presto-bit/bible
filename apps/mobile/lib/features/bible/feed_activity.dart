/// 发现动态回跳读经提示（对齐 Web `feed_activity.ts`）。
library;

enum FeedActivityKind { checkin, thought, note }

class FeedActivityHint {
  const FeedActivityHint({
    required this.author,
    required this.kind,
    this.groupName,
    this.body,
  });

  final String author;
  final FeedActivityKind kind;
  final String? groupName;
  final String? body;
}

String feedHintMessage(FeedActivityHint hint) {
  final who = hint.author.isNotEmpty ? hint.author : '同伴';
  return switch (hint.kind) {
    FeedActivityKind.thought => '$who 分享了一则想法',
    FeedActivityKind.note => '$who 分享了一则笔记',
    FeedActivityKind.checkin =>
      hint.groupName != null ? '$who 在「${hint.groupName}」打卡' : '$who 完成了打卡',
  };
}

FeedActivityHint? parseFeedHint(Map<String, String?> params) {
  final author = params['feedAuthor'];
  final kindRaw = params['feedKind'];
  if (author == null || author.isEmpty || kindRaw == null) return null;
  final kind = switch (kindRaw) {
    'thought' => FeedActivityKind.thought,
    'note' => FeedActivityKind.note,
    _ => FeedActivityKind.checkin,
  };
  return FeedActivityHint(
    author: author,
    kind: kind,
    groupName: params['feedGroup'],
    body: params['feedBody'],
  );
}
