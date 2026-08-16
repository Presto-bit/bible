/// 小爱输出场景：与后端 services/api/app/ai/scenes.py 对齐。
library;

enum AssistantScene {
  verseQuick('verse_quick', 'explain', 90000),
  verseFull('verse_full', 'explain', 150000),
  chatExplain('chat_explain', 'explain', 90000),
  chatUnderstand('chat_understand', 'understand', 90000),
  chatApply('chat_apply', 'apply', 90000),
  chatStudy('chat_study', 'understand', 120000),
  chatPreach('chat_preach', 'preach', 120000),
  chatCompare('chat_compare', 'compare', 90000),
  chatOriginal('chat_original', 'original', 90000),
  chatViewpoints('chat_viewpoints', 'explain', 90000),
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

/// 显式要求「并列观点 / 争议题」的短语。
const _viewpointsExplicitPhrases = [
  '并列观点',
  '不同看法',
  '不同观点',
  '各家怎么说',
  '各家怎么看',
  '有争议吗',
  '有没有争议',
  '争议',
  '两派',
  '几种理解',
  '多种理解',
  '双方观点',
  '正反两边',
  '不同传统',
  '不同教派',
];

/// 轻量争议主题词：命中后结合语气词建议走并列观点。
const _viewpointsTopicHints = [
  '预定论',
  '拣选',
  '一次得救',
  '恩赐',
  '方言',
  '洗脚',
  '离婚再婚',
  '再婚',
  '守安息日',
  '洗礼方式',
  '浸礼',
  '圣餐',
  '女性讲道',
  '女人讲道',
  '女人蒙头',
  '创造论',
  '进化',
  '千禧年',
  '被提',
];

final _viewpointsToneRe = RegExp(r'怎么看|怎么说|如何理解|哪[个种]|还是|争议|分歧|看法|观点');

/// 检测用户是否显式要求「并列观点 / 争议题」作答。
bool detectsViewpointsIntent(String question) {
  final q = question.trim();
  if (q.isEmpty) return false;
  for (final p in _viewpointsExplicitPhrases) {
    if (q.contains(p)) return true;
  }
  for (final t in _viewpointsTopicHints) {
    if (q.contains(t) && _viewpointsToneRe.hasMatch(q)) return true;
  }
  return false;
}

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
  if (label == '并列观点') {
    return '请就$anchor相关常见争议，并列说明主要理解与各自依据，不要替我做教义裁决。';
  }
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
    '并列观点': AssistantScene.chatViewpoints,
    '今日默想': AssistantScene.chatApply,
    '信仰问答': AssistantScene.chatUnderstand,
    '坚持鼓励': AssistantScene.chatApply,
  };
  return map[label] ?? AssistantScene.chatExplain;
}
