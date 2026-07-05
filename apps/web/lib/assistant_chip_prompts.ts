/** 小爱 chip 定义（展示标签 → scene + 短问句） */

import {
  SCENES,
  chipSceneForLabel,
  chipUserQuestion,
  type AssistantScene,
} from './assistant_scenes';

export interface AssistantChipDef {
  label: string;
  mode: string;
  scene: AssistantScene;
  q: string;
}

export function staticAssistantChips(ref?: string): AssistantChipDef[] {
  const labels = [
    '解释经文',
    '生活应用',
    '预备查经',
    '译本对照',
    '讲道大纲',
  ];
  return labels.map((label) => {
    const scene = chipSceneForLabel(label);
    return {
      label,
      mode: SCENES[scene].mode,
      scene,
      q: chipUserQuestion(label, ref),
    };
  });
}

export function chipDef(
  label: string,
  scene: AssistantScene,
  ref?: string,
): AssistantChipDef {
  return { label, mode: SCENES[scene].mode, scene, q: chipUserQuestion(label, ref) };
}
