/** 读经半屏 L1 / 默认 L3 chip（对齐 v3.1 定稿） */

import { SCENES, type AssistantScene } from './assistant_scenes';

export interface HalfSheetChipDef {
  label: string;
  scene: AssistantScene;
  mode: string;
  q: string;
}

export function halfSheetL1Chips(refLabel?: string): HalfSheetChipDef[] {
  const anchor = refLabel?.trim() ? `「${refLabel.trim()}」` : '这段经文';
  const rows: Array<[string, AssistantScene, string]> = [
    [
      '经文背景',
      'chat_explain',
      `请补充${anchor}的历史与上下文背景，150字内。`,
    ],
    [
      '生活应用',
      'chat_apply',
      `请把${anchor}应用到今日生活，给出2–3条具体行动。`,
    ],
    [
      '原文词义',
      'chat_original',
      `${anchor}里最关键的词原文是什么意思？`,
    ],
    [
      '和上下文连',
      'chat_understand',
      `${anchor}和前后文怎么连在一起读？`,
    ],
  ];
  return rows.map(([label, scene, q]) => ({
    label,
    scene,
    mode: SCENES[scene].mode,
    q,
  }));
}

/** 服务端未返回 followups 时的兜底（2–3 条，Chip 短问句） */
export function defaultHalfSheetFollowups(_refLabel: string): string[] {
  return ['核心词何意？', '历史背景？', '今天怎么用？'];
}

export function halfSheetSelectionKey(
  ref: string,
  selection: string,
  explicitSelection: boolean,
): string {
  const sel = explicitSelection ? selection.trim() : '';
  return `${ref.trim().toUpperCase()}\x1e${sel}`;
}
