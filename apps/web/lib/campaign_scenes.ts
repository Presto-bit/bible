/** 新建活动：空白起点 + 平台模板（读经）+ 我的模板 */

export type CampaignSceneId = 'mine' | 'read';

export type CampaignScene = {
  id: CampaignSceneId;
  title: string;
  sub: string;
  /** 空数组表示「我的模板」特殊入口 */
  templateIds: string[];
};

/** 新建页展示的平台模板（空白 + 读经）；其它 TEMPLATES 仍可用于旧活动 */
export const NEW_PLATFORM_TEMPLATE_IDS = ['blank', 'multi_day', 'verse_day', 'memory'] as const;

export type NewPlatformTemplateId = (typeof NEW_PLATFORM_TEMPLATE_IDS)[number];

/** 平台模板预置控件标签（新建卡片展示用） */
export const PLATFORM_TEMPLATE_BLOCK_LABELS: Record<string, string[]> = {
  blank: ['文本', '主按钮'],
  multi_day: ['文本', '日课', '互动', '主按钮'],
  verse_day: ['文本', '日课', '互动', '主按钮'],
  memory: ['文本', '日课', '互动', '主按钮'],
};

/** @deprecated 保留兼容；新建页已改为空白 + 平台模板列表 */
export const CAMPAIGN_SCENES: CampaignScene[] = [
  {
    id: 'read',
    title: '带大家读经',
    sub: '多日资料、经文日、背诵清单',
    templateIds: ['multi_day', 'verse_day', 'memory'],
  },
];

export function sceneById(id: CampaignSceneId | null): CampaignScene | undefined {
  if (!id || id === 'mine') return undefined;
  return CAMPAIGN_SCENES.find((s) => s.id === id);
}

export function sceneForTemplate(templateId: string): CampaignScene | undefined {
  return CAMPAIGN_SCENES.find((s) => s.templateIds.includes(templateId));
}
