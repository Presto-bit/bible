export type GroupTaskType = 'read' | 'memorize' | 'pray' | 'share' | 'custom';
export type GroupCompletionRule = 'tap' | 'checkin_text' | 'checkin_ref' | 'read_done';

export const GROUP_TASK_TYPES: Array<{ id: GroupTaskType; label: string }> = [
  { id: 'read', label: '读经' },
  { id: 'memorize', label: '金句' },
  { id: 'pray', label: '代祷' },
  { id: 'share', label: '分享' },
  { id: 'custom', label: '自定义' },
];

export const DEFAULT_RULE_BY_TYPE: Record<GroupTaskType, GroupCompletionRule> = {
  read: 'read_done',
  memorize: 'checkin_ref',
  pray: 'tap',
  share: 'checkin_text',
  custom: 'checkin_text',
};

export const COMPLETION_RULE_OPTIONS: Array<{ id: GroupCompletionRule; label: string }> = [
  { id: 'tap', label: '点完成即可' },
  { id: 'checkin_text', label: '必须留言' },
  { id: 'checkin_ref', label: '须关联经文' },
  { id: 'read_done', label: '读完确认' },
];

export const GROUP_TASK_TEMPLATES = [
  {
    id: 'read_chapter',
    title: '读今日计划一章',
    ref: null as string | null,
    task_type: 'read' as GroupTaskType,
    completion_rule: 'read_done' as GroupCompletionRule,
  },
  {
    id: 'memorize',
    title: '背一节金句',
    ref: 'JHN.3.16',
    task_type: 'memorize' as GroupTaskType,
    completion_rule: 'checkin_ref' as GroupCompletionRule,
  },
  {
    id: 'pray',
    title: '为小组代祷 5 分钟',
    ref: null as string | null,
    task_type: 'pray' as GroupTaskType,
    completion_rule: 'tap' as GroupCompletionRule,
  },
  {
    id: 'meditate',
    title: '默想：今天哪节经文触动你？',
    ref: null as string | null,
    task_type: 'share' as GroupTaskType,
    completion_rule: 'checkin_text' as GroupCompletionRule,
  },
  {
    id: 'share',
    title: '分享一句今日收获',
    ref: null as string | null,
    task_type: 'share' as GroupTaskType,
    completion_rule: 'checkin_text' as GroupCompletionRule,
  },
] as const;

export type GroupTaskTemplateId = (typeof GROUP_TASK_TEMPLATES)[number]['id'];

export type DuePreset = 'today' | 'tomorrow' | 'sunday' | 'days3' | 'none';

export function resolveDueAt(preset: DuePreset): string | undefined {
  if (preset === 'none') return undefined;
  const now = new Date();
  const endOf = (d: Date) => {
    const x = new Date(d);
    x.setHours(23, 59, 0, 0);
    return x.toISOString();
  };
  if (preset === 'today') return endOf(now);
  if (preset === 'tomorrow') {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return endOf(d);
  }
  if (preset === 'sunday') {
    const d = new Date(now);
    const day = d.getDay();
    const add = day === 0 ? 0 : 7 - day;
    d.setDate(d.getDate() + add);
    return endOf(d);
  }
  return new Date(Date.now() + 3 * 86400000).toISOString();
}

export const DUE_PRESETS: Array<{ id: DuePreset; label: string }> = [
  { id: 'today', label: '今天' },
  { id: 'tomorrow', label: '明天' },
  { id: 'sunday', label: '本周日' },
  { id: 'days3', label: '3 天后' },
  { id: 'none', label: '不限' },
];
