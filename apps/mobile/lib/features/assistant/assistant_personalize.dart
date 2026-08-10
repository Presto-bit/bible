/// 小爱定制化快捷提问（随用户读经特征变化）。
library;

import 'assistant_scenes.dart';
import 'models.dart';

class AssistantChip {
  const AssistantChip({
    required this.label,
    required this.scene,
    required this.q,
  });
  final String label;
  final AssistantScene scene;
  final String q;

  String get mode => scene.mode;

  AssistantMode get assistantMode =>
      AssistantMode.fromId(scene.mode) ?? AssistantMode.explain;
}

AssistantChip _chip(String label, AssistantScene scene, String q) =>
    AssistantChip(label: label, scene: scene, q: q);

/// 空态 / 输入区快捷 chip：有锚定经文、连续读经天数、今日主题时更贴身。
List<AssistantChip> personalizedAssistantChips({
  String? ref,
  String? dailyVerseRef,
  String? dailyTheme,
  int streak = 0,
  bool hasLastRead = false,
}) {
  final anchor = (ref != null && ref.isNotEmpty)
      ? ref
      : (dailyVerseRef != null && dailyVerseRef.isNotEmpty ? dailyVerseRef : '');
  final refLabel = anchor.isNotEmpty ? anchor : null;
  final chips = <AssistantChip>[];

  if (anchor.isNotEmpty) {
    chips.addAll([
      _chip(
        '经文背景',
        AssistantScene.chatExplain,
        chipUserQuestion('解释经文', ref: refLabel),
      ),
      _chip(
        '生活应用',
        AssistantScene.chatApply,
        chipUserQuestion('生活应用', ref: refLabel),
      ),
      _chip(
        '预备查经',
        AssistantScene.chatStudy,
        chipUserQuestion('预备查经', ref: refLabel),
      ),
      _chip(
        '译本对照',
        AssistantScene.chatCompare,
        chipUserQuestion('译本对照', ref: refLabel),
      ),
      _chip(
        '并列观点',
        AssistantScene.chatViewpoints,
        chipUserQuestion('并列观点', ref: refLabel),
      ),
    ]);
  } else {
    final themeBit =
        (dailyTheme != null && dailyTheme.isNotEmpty) ? '（主题：$dailyTheme）' : '';
    chips.addAll([
      _chip(
        '今日默想',
        AssistantScene.chatApply,
        '根据今日经文$themeBit，请给我 3 个适合个人的默想问题。',
      ),
      _chip(
        '生活应用',
        AssistantScene.chatApply,
        chipUserQuestion('生活应用', ref: refLabel),
      ),
      _chip(
        '信仰问答',
        AssistantScene.chatUnderstand,
        '作为读经初学者，请用浅显的中文解释「因信称义」是什么意思。',
      ),
      _chip(
        '预备查经',
        AssistantScene.chatStudy,
        chipUserQuestion('预备查经', ref: refLabel),
      ),
    ]);
    if (hasLastRead) {
      chips.add(
        _chip(
          '解释经文',
          AssistantScene.chatExplain,
          chipUserQuestion('解释经文', ref: refLabel),
        ),
      );
    }
  }

  if (streak >= 7) {
    chips.add(
      _chip(
        '坚持鼓励',
        AssistantScene.chatApply,
        '我已连续读经 $streak 天，请根据这段属灵旅程给我一段鼓励与下一步建议。',
      ),
    );
  }

  final seen = <String>{};
  return chips
      .where((c) {
        if (seen.contains(c.label)) return false;
        seen.add(c.label);
        return true;
      })
      .take(6)
      .toList();
}
