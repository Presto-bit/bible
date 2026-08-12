/// 跨 Tab 打开小爱：携带锚点经文、首问，以及半屏种子线程。
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'models.dart';

class AssistantSeedMessage {
  const AssistantSeedMessage({
    required this.role,
    required this.text,
    this.citations = const [],
  });

  final String role; // user | assistant
  final String text;
  final List<Citation> citations;
}

class AssistantSeed {
  const AssistantSeed({
    this.ref,
    this.question,
    this.knowledgeBaseId,
    this.seedMessages = const [],
  });

  final String? ref;
  final String? question;
  final String? knowledgeBaseId;

  /// 半屏接力：已有问答对，进入小爱时直接灌入，避免再问一遍。
  final List<AssistantSeedMessage> seedMessages;
}

class AssistantSeedNotifier extends Notifier<AssistantSeed?> {
  @override
  AssistantSeed? build() => null;

  void open({
    String? ref,
    String? question,
    String? knowledgeBaseId,
    List<AssistantSeedMessage> seedMessages = const [],
  }) {
    state = AssistantSeed(
      ref: ref,
      question: question,
      knowledgeBaseId: knowledgeBaseId,
      seedMessages: seedMessages,
    );
  }

  void consume() => state = null;
}

final assistantSeedProvider =
    NotifierProvider<AssistantSeedNotifier, AssistantSeed?>(
        AssistantSeedNotifier.new);
