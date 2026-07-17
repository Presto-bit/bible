/// 跨 Tab 打开小爱：携带锚点经文与首问。
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

class AssistantSeed {
  const AssistantSeed({this.ref, this.question, this.knowledgeBaseId});
  final String? ref;
  final String? question;
  final String? knowledgeBaseId;
}

class AssistantSeedNotifier extends Notifier<AssistantSeed?> {
  @override
  AssistantSeed? build() => null;

  void open({String? ref, String? question, String? knowledgeBaseId}) {
    state = AssistantSeed(
      ref: ref,
      question: question,
      knowledgeBaseId: knowledgeBaseId,
    );
  }

  void consume() => state = null;
}

final assistantSeedProvider =
    NotifierProvider<AssistantSeedNotifier, AssistantSeed?>(
        AssistantSeedNotifier.new);
