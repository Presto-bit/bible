import 'package:flutter_test/flutter_test.dart';

import 'package:presto_bible/features/assistant/models.dart';

void main() {
  test('AssistantMode 三种模式与 id 对齐后端', () {
    expect(AssistantMode.values.length, 3);
    expect(AssistantMode.understand.id, 'understand');
    expect(AssistantMode.explain.id, 'explain');
    expect(AssistantMode.apply.id, 'apply');
  });

  test('ChatMeta 解析 citations 与 quota', () {
    final m = ChatMeta.fromJson({
      'mode': 'explain',
      'mode_label': '释经解释',
      'display': '约翰福音 3:16',
      'citations': [
        {'n': 1, 'title': '0041-约翰福音', 'score': 0.97},
      ],
      'quota': {'used': 1, 'limit': 10},
    });
    expect(m.display, '约翰福音 3:16');
    expect(m.citations.single.title, '0041-约翰福音');
    expect(m.quotaUsed, 1);
    expect(m.quotaLimit, 10);
  });
}
