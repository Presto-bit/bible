import 'package:flutter_test/flutter_test.dart';

import 'package:presto_bible/features/assistant/models.dart';

void main() {
  test('AssistantMode 六种模式与 id 对齐后端', () {
    expect(AssistantMode.values.length, 6);
    expect(AssistantMode.understand.id, 'understand');
    expect(AssistantMode.explain.id, 'explain');
    expect(AssistantMode.apply.id, 'apply');
    expect(AssistantMode.compare.id, 'compare');
    expect(AssistantMode.original.id, 'original');
    expect(AssistantMode.preach.id, 'preach');
  });

  test('ChatMeta 解析 citations 与 quota', () {
    final m = ChatMeta.fromJson({
      'mode': 'explain',
      'citations': [
        {'n': 1, 'title': 'T', 'score': 0.9, 'snippet': 's'},
      ],
      'quota': {'used': 1, 'limit': 10},
    });
    expect(m.citations.length, 1);
    expect(m.quotaUsed, 1);
    expect(m.quotaLimit, 10);
  });
}
