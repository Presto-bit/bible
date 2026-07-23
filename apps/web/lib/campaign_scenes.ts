/** 新建活动：先选意图，再展示该意图下的模板（避免一次铺开全部） */

export type CampaignSceneId = 'mine' | 'read';

export type CampaignScene = {
  id: CampaignSceneId;
  title: string;
  sub: string;
  /** 空数组表示「我的模板」特殊入口 */
  templateIds: string[];
};

/** 本期仅开放「带大家读经」场景；其它场景模板仍可编辑已有活动，但不出现在新建选型 */
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
