/** 小爱输出场景：与后端 services/api/app/ai/scenes.py 对齐。 */

export type AssistantScene =
  | 'verse_quick'
  | 'verse_full'
  | 'chat_explain'
  | 'chat_understand'
  | 'chat_apply'
  | 'chat_study'
  | 'chat_preach'
  | 'chat_compare'
  | 'chat_original'
  | 'chat_general'
  | 'summary_chapter'
  | 'summary_book';

export interface SceneConfig {
  id: AssistantScene;
  mode: string;
  label: string;
  timeoutMs: number;
  wantsFollowups: boolean;
}

export const SCENES: Record<AssistantScene, SceneConfig> = {
  verse_quick: {
    id: 'verse_quick',
    mode: 'explain',
    label: '快读解释',
    timeoutMs: 45_000,
    wantsFollowups: false,
  },
  verse_full: {
    id: 'verse_full',
    mode: 'explain',
    label: '综合解读',
    timeoutMs: 90_000,
    wantsFollowups: false,
  },
  chat_explain: {
    id: 'chat_explain',
    mode: 'explain',
    label: '释经解释',
    timeoutMs: 90_000,
    wantsFollowups: true,
  },
  chat_understand: {
    id: 'chat_understand',
    mode: 'understand',
    label: '理解默想',
    timeoutMs: 90_000,
    wantsFollowups: true,
  },
  chat_apply: {
    id: 'chat_apply',
    mode: 'apply',
    label: '生活应用',
    timeoutMs: 90_000,
    wantsFollowups: true,
  },
  chat_study: {
    id: 'chat_study',
    mode: 'understand',
    label: '预备查经',
    timeoutMs: 120_000,
    wantsFollowups: true,
  },
  chat_preach: {
    id: 'chat_preach',
    mode: 'preach',
    label: '讲道大纲',
    timeoutMs: 120_000,
    wantsFollowups: false,
  },
  chat_compare: {
    id: 'chat_compare',
    mode: 'compare',
    label: '译本对照',
    timeoutMs: 90_000,
    wantsFollowups: true,
  },
  chat_original: {
    id: 'chat_original',
    mode: 'original',
    label: '原文释义',
    timeoutMs: 90_000,
    wantsFollowups: true,
  },
  chat_general: {
    id: 'chat_general',
    mode: 'explain',
    label: '主题问答',
    timeoutMs: 90_000,
    wantsFollowups: true,
  },
  summary_chapter: {
    id: 'summary_chapter',
    mode: 'explain',
    label: '章导读',
    timeoutMs: 60_000,
    wantsFollowups: false,
  },
  summary_book: {
    id: 'summary_book',
    mode: 'explain',
    label: '卷导读',
    timeoutMs: 60_000,
    wantsFollowups: false,
  },
};

const REF_BOUND_SCENES = new Set<AssistantScene>([
  'verse_quick',
  'verse_full',
  'chat_explain',
  'chat_understand',
  'chat_apply',
  'chat_study',
  'chat_preach',
  'chat_compare',
  'chat_original',
]);

const MODE_TO_SCENE: Record<string, AssistantScene> = {
  explain: 'chat_explain',
  understand: 'chat_understand',
  apply: 'chat_apply',
  compare: 'chat_compare',
  original: 'chat_original',
  preach: 'chat_preach',
};

export function resolveScene(
  scene?: string | null,
  mode?: string,
  hasRef = true,
): AssistantScene {
  if (!hasRef) {
    if (scene && scene in SCENES && !REF_BOUND_SCENES.has(scene as AssistantScene)) {
      return scene as AssistantScene;
    }
    return 'chat_general';
  }
  if (scene && scene in SCENES) return scene as AssistantScene;
  if (mode && MODE_TO_SCENE[mode]) return MODE_TO_SCENE[mode];
  return 'chat_explain';
}

export function sceneTimeout(scene: AssistantScene): number {
  return SCENES[scene].timeoutMs;
}

/** chip 用户可见问句（短）；完整结构由后端 scene 控制。 */
export function chipUserQuestion(label: string, ref?: string): string {
  const anchor = ref ? `「${ref}」` : '这段经文';
  const map: Record<string, string> = {
    解释经文: `请解释${anchor}的原意与背景。`,
    生活应用: `请把${anchor}应用到今日生活，给出具体可行的建议。`,
    预备查经: `请帮我预备关于${anchor}的小组查经提纲。`,
    译本对照: `请对照不同中文译本解释${anchor}的措辞差异。`,
    原文释义: `请从圣经原文角度解释${anchor}的关键词。`,
    讲道大纲: `请为${anchor}生成讲道大纲要点。`,
  };
  return map[label] ?? `关于${anchor}，请按「${label}」作答。`;
}

export function chipSceneForLabel(label: string): AssistantScene {
  const map: Record<string, AssistantScene> = {
    解释经文: 'chat_explain',
    生活应用: 'chat_apply',
    预备查经: 'chat_study',
    译本对照: 'chat_compare',
    原文释义: 'chat_original',
    讲道大纲: 'chat_preach',
  };
  return map[label] ?? 'chat_explain';
}

export function personalizedSceneForLabel(label: string): AssistantScene {
  if (label === '关键词释义') return 'chat_original';
  if (label === '今日默想' || label === '生活应用' || label === '坚持鼓励') return 'chat_apply';
  if (label === '信仰问答') return 'chat_general';
  return 'chat_explain';
}
