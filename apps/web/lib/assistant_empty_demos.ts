/** 小爱空状态可点示范问（导向释经资料检索） */

import { SCENES, type AssistantScene } from './assistant_scenes';

export type AssistantDemoQuestion = {
  label: string;
  q: string;
  scene: AssistantScene;
  mode: string;
};

export const ASSISTANT_EMPTY_DEMOS: AssistantDemoQuestion[] = [
  {
    label: '约翰福音 3:16，传统注释怎么讲？',
    q: '约翰福音 3:16 在传统释经资料里通常怎么解释？请尽量引用注释要点。',
    scene: 'chat_explain',
    mode: SCENES.chat_explain.mode,
  },
  {
    label: '「爱」在原文是什么意思？',
    q: '新约里「爱」常用的原文词（如 agape、phileo）有什么区别？请结合释经资料说明。',
    scene: 'chat_original',
    mode: SCENES.chat_original.mode,
  },
  {
    label: '这段经文的历史背景？',
    q: '请介绍一段常见经文（如约翰福音 3 章）的历史与写作背景，并参考释经资料。',
    scene: 'chat_explain',
    mode: SCENES.chat_explain.mode,
  },
  {
    label: '怎样用在今天的生活？',
    q: '若今天读到「不要忧虑」（马太福音 6:25–34），释经与应用上可以怎么落到日常生活？',
    scene: 'chat_apply',
    mode: SCENES.chat_apply.mode,
  },
];
