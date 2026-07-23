/** 新建活动：先选意图，再展示该意图下的模板（避免一次铺开全部） */

export type CampaignSceneId =
  | 'mine'
  | 'read'
  | 'gather'
  | 'prayer'
  | 'serve'
  | 'welcome'
  | 'share'
  | 'more';

export type CampaignScene = {
  id: CampaignSceneId;
  title: string;
  sub: string;
  /** 空数组表示「我的模板」特殊入口 */
  templateIds: string[];
};

export const CAMPAIGN_SCENES: CampaignScene[] = [
  {
    id: 'read',
    title: '带大家读经',
    sub: '多日资料、经文日、背诵清单',
    templateIds: ['multi_day', 'verse_day', 'memory'],
  },
  {
    id: 'gather',
    title: '通知一次聚会',
    sub: '时间地点、出席确认、节期聚会',
    templateIds: ['gathering', 'season'],
  },
  {
    id: 'prayer',
    title: '收集代祷',
    sub: '代祷意向（明细默认仅管理可见）',
    templateIds: ['prayer_drive'],
  },
  {
    id: 'serve',
    title: '招募服事',
    sub: '岗位名额报名',
    templateIds: ['serve'],
  },
  {
    id: 'welcome',
    title: '迎新与见证',
    sub: '欢迎新人、征集短见证',
    templateIds: ['welcome', 'testify'],
  },
  {
    id: 'share',
    title: '轻号召与导航',
    sub: '一句话动员、多入口分发',
    templateIds: ['promo', 'hub'],
  },
];

export function sceneById(id: CampaignSceneId | null): CampaignScene | undefined {
  if (!id || id === 'mine') return undefined;
  return CAMPAIGN_SCENES.find((s) => s.id === id);
}

export function sceneForTemplate(templateId: string): CampaignScene | undefined {
  return CAMPAIGN_SCENES.find((s) => s.templateIds.includes(templateId));
}
