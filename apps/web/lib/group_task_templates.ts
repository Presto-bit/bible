export const GROUP_TASK_TEMPLATES = [
  { id: 'read_chapter', title: '读今日计划一章', ref: null as string | null },
  { id: 'memorize', title: '背一节金句', ref: 'JHN.3.16' },
  { id: 'pray', title: '为小组代祷 5 分钟', ref: null },
  { id: 'meditate', title: '默想：今天哪节经文触动你？', ref: null },
  { id: 'share', title: '分享一句今日收获', ref: null },
] as const;

export type GroupTaskTemplateId = (typeof GROUP_TASK_TEMPLATES)[number]['id'];
