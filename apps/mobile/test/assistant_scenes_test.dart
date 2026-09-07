import 'package:flutter_test/flutter_test.dart';

import 'package:presto_bible/features/assistant/assistant_scenes.dart';

void main() {
  group('resolveChatTurn', () {
    test('首轮有 anchor 时传 ref', () {
      final r = resolveChatTurn(
        anchorRef: 'JHN.3.16',
        historyLength: 0,
        explicitScene: AssistantScene.chatApply,
      );
      expect(r.refForApi, 'JHN.3.16');
      expect(r.scene, AssistantScene.chatApply);
    });

    test('多轮 chip 仍保留 ref 与 REF_BOUND scene', () {
      final r = resolveChatTurn(
        anchorRef: 'JHN.3.16',
        historyLength: 2,
        explicitScene: AssistantScene.chatApply,
      );
      expect(r.refForApi, 'JHN.3.16');
      expect(r.scene, AssistantScene.chatApply);
    });

    test('多轮自由追问仍传 anchor ref', () {
      final r = resolveChatTurn(
        anchorRef: 'JHN.3.16',
        historyLength: 2,
        mode: 'apply',
      );
      expect(r.refForApi, 'JHN.3.16');
      expect(r.scene, AssistantScene.chatApply);
    });

    test('无 anchor 时降为 chat_general', () {
      final r = resolveChatTurn(
        anchorRef: null,
        historyLength: 1,
        mode: 'explain',
      );
      expect(r.refForApi, isNull);
      expect(r.scene, AssistantScene.chatGeneral);
    });
  });

  group('detectsViewpointsIntent', () {
    test('显式并列观点', () {
      expect(detectsViewpointsIntent('请并列观点说明'), isTrue);
    });
  });
}
