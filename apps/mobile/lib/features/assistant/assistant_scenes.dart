/// 小爱输出场景：与后端 services/api/app/ai/scenes.py 对齐。
library;

enum AssistantScene {
  verseQuick('verse_quick', 'explain', 45000),
  verseFull('verse_full', 'explain', 90000),
  chatExplain('chat_explain', 'explain', 90000),
  chatUnderstand('chat_understand', 'understand', 90000),
  chatApply('chat_apply', 'apply', 90000),
  chatStudy('chat_study', 'understand', 120000),
  chatPreach('chat_preach', 'preach', 120000),
  chatCompare('chat_compare', 'compare', 90000),
  chatOriginal('chat_original', 'original', 90000),
  summaryChapter('summary_chapter', 'explain', 60000),
  summaryBook('summary_book', 'explain', 60000);

  const AssistantScene(this.id, this.mode, this.timeoutMs);
  final String id;
  final String mode;
  final int timeoutMs;
}

const _modeToScene = <String, AssistantScene>{
  'explain': AssistantScene.chatExplain,
  'understand': AssistantScene.chatUnderstand,
  'apply': AssistantScene.chatApply,
  'compare': AssistantScene.chatCompare,
  'original': AssistantScene.chatOriginal,
  'preach': AssistantScene.chatPreach,
};

AssistantScene resolveScene({String? scene, String? mode}) {
  if (scene != null) {
    for (final s in AssistantScene.values) {
      if (s.id == scene) return s;
    }
  }
  if (mode != null && _modeToScene.containsKey(mode)) {
    return _modeToScene[mode]!;
  }
  return AssistantScene.chatExplain;
}

String chipUserQuestion(String label, {String? ref}) {
  final anchor = ref != null && ref.isNotEmpty ? '「$ref」' : '这段经文';
  if (label == '解释经文') return '请解释$anchor的原意与背景。';
  if (label == '生活应用') return '请把$anchor应用到今日生活，给出具体可行的建议。';
  if (label == '预备查经') return '请帮我预备关于$anchor的小组查经提纲。';
  if (label == '译本对照') {
    return '请说明$anchor在圣经原文中的整句表达与含义，并对照不同译本的措辞差异。';
  }
  if (label == '原文释义') {
    return '请说明$anchor在圣经原文中的整句表达与含义，并对照不同译本的措辞差异。';
  }
  if (label == '讲道大纲') return '请为$anchor生成讲道大纲要点。';
  return '关于$anchor，请按「$label」作答。';
}

AssistantScene chipSceneForLabel(String label) {
  const map = {
    '解释经文': AssistantScene.chatExplain,
    '生活应用': AssistantScene.chatApply,
    '预备查经': AssistantScene.chatStudy,
    '译本对照': AssistantScene.chatCompare,
    '原文释义': AssistantScene.chatCompare,
    '讲道大纲': AssistantScene.chatPreach,
    '经文背景': AssistantScene.chatExplain,
    '应用': AssistantScene.chatApply,
    '预备讲道': AssistantScene.chatPreach,
  };
  return map[label] ?? AssistantScene.chatExplain;
}
