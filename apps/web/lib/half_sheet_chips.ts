/** 读经半屏 L1 / 默认 L3 chip（OIA 加深） */

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
      '更多关联',
      'chat_understand',
      `${anchor}和前后文、整卷主题怎么连在一起？不要重复半屏已说的内容，150字内。`,
    ],
    [
      '更多应用',
      'chat_apply',
      `基于${anchor}的本意，今天可以怎么回应？给出2–3条具体行动，不要重复半屏已说的内容。`,
    ],
    [
      '展开解释',
      'chat_explain',
      `补充${anchor}的历史处境与关键词义，不要重复半屏已解释的字句，150字内。`,
    ],
    [
      '原文词义',
      'chat_original',
      `${anchor}里最关键的词原文是什么意思？`,
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
  return ['这段最关键的一个词？', '和前后文怎么连？', '可以怎么祷告回应？'];
}

export function halfSheetSelectionKey(
  ref: string,
  selection: string,
  explicitSelection: boolean,
): string {
  const sel = explicitSelection ? selection.trim() : '';
  return `${ref.trim().toUpperCase()}\x1e${sel}`;
}
