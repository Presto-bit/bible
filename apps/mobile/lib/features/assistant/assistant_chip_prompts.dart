/// 小爱静态 chip（对齐 `apps/web/lib/assistant_chip_prompts.ts`）。
library;

import 'assistant_personalize.dart';
import 'assistant_scenes.dart';

const _staticLabels = ['解释经文', '生活应用', '预备查经', '译本对照', '并列观点', '讲道大纲'];

List<AssistantChip> staticAssistantChips([String? ref]) {
  return [
    for (final label in _staticLabels)
      AssistantChip(
        label: label,
        scene: chipSceneForLabel(label),
        q: chipUserQuestion(label, ref: ref),
      ),
  ];
}
