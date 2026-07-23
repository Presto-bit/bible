/** 活动运营前端辅助：发布检查清单、日课解锁文案等（进度与发布共用同一套规则） */

import type { OpsCampaignLanding } from '@/lib/api';
import { BRAND_NAME } from '@/lib/brand';
import { shareCard } from '@/lib/share_card';

export type PublishChecklistInput = {
  name: string;
  templateId: string;
  groupIds: string[];
  landing: OpsCampaignLanding;
  railEnabled?: boolean;
  railSlot?: number;
  audienceMode?: 'groups' | 'all' | 'admin_preview';
  isPlatformAdmin?: boolean;
  startAt?: string;
  endAt?: string;
};

export type CampaignConfigSectionId = 'basic' | 'content' | 'audience' | 'exposure';

/** 配置顺序：先写清活动，再定谁看、怎么曝光 */
export const CAMPAIGN_CONFIG_SECTIONS: Array<{
  id: CampaignConfigSectionId;
  anchor: string;
  label: string;
  hint: string;
}> = [
  { id: 'basic', anchor: 'ops-sec-basic', label: '基本', hint: '名称与推荐文案' },
  { id: 'content', anchor: 'ops-sec-content', label: '落地页', hint: '控件搭建内容' },
  { id: 'audience', anchor: 'ops-sec-audience', label: '可见范围', hint: '谁能看见' },
  { id: 'exposure', anchor: 'ops-sec-exposure', label: '首页曝光', hint: '推荐位与时段' },
];

function parseLocalOrIso(value: string): number {
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? NaN : t;
}

/** 某一配置分区的缺失项（空数组 = 该区完成） */
export function buildSectionChecklist(
  section: CampaignConfigSectionId,
  input: PublishChecklistInput,
): string[] {
  const errors: string[] = [];
  const landing = input.landing || {};
  const templateId = input.templateId || '';

  switch (section) {
    case 'basic': {
      if (!input.name?.trim()) errors.push('请填写活动名称');
      break;
    }
    case 'audience': {
      const mode = input.audienceMode || 'groups';
      if (mode === 'all' || mode === 'admin_preview') {
        if (!input.isPlatformAdmin) errors.push('仅平台超管可发布全站/预览受众');
      } else if (!input.groupIds?.length) {
        errors.push('请选择谁能看见（至少一个群）');
      }
      break;
    }
    case 'exposure': {
      const start = (input.startAt || '').trim();
      const end = (input.endAt || '').trim();
      if (!start || !end) {
        errors.push('请设置活动开始与结束时间');
        break;
      }
      const s = parseLocalOrIso(start);
      const e = parseLocalOrIso(end);
      if (Number.isNaN(s) || Number.isNaN(e) || e <= s) {
        errors.push('结束时间须晚于开始时间');
      }
      if (input.railEnabled !== false) {
        const slot = Number(input.railSlot || 0);
        if (slot < 1 || slot > 3) errors.push('请选择今日推荐位置（第 1～3 位）');
      }
      break;
    }
    case 'content': {
      const days = landing.days || [];
      const body = (landing.body || '').trim();

      if (templateId === 'multi_day' || templateId === 'memory' || templateId === 'verse_day') {
        const filled = days.filter(
          (d) => (d.body || '').trim() || (d.verseRef || '').trim(),
        );
        if (!filled.length) errors.push('日课/经文清单至少填写一天内容');
      }

      if (templateId === 'gathering') {
        const schedule = landing.schedule;
        const hasTime = Boolean((schedule?.startsAt || '').trim());
        const hasPlace =
          Boolean((schedule?.location || '').trim()) ||
          Boolean((schedule?.onlineNote || '').trim());
        if (!hasTime) errors.push('聚会请填写开始时间');
        if (!hasPlace) errors.push('聚会请填写地点或线上说明');
      }

      if (templateId === 'season') {
        if (!body) errors.push('请填写节期说明');
      }

      if (templateId === 'serve') {
        const slots = landing.slots || [];
        const valid = slots.filter((s) => (s.title || '').trim() && (s.limit || 0) > 0);
        if (!valid.length) errors.push('服事招募请至少配置一个有名额的岗位');
      }

      if (templateId === 'hub') {
        const entries = landing.entries || [];
        const valid = entries.filter((e) => (e.title || '').trim() && (e.href || '').trim());
        if (valid.length < 2) errors.push('多入口请至少配置 2 个有效入口（标题+链接）');
      }

      if (templateId === 'promo') {
        if (!body) errors.push('请填写动员说明');
      }

      if (templateId === 'prayer_drive' || templateId === 'welcome' || templateId === 'testify') {
        if (!body) errors.push('请填写活动说明');
      }

      break;
    }
    default:
      break;
  }
  return errors;
}

export function buildContentChecklist(input: PublishChecklistInput): string[] {
  return buildSectionChecklist('content', input);
}

export function campaignSectionDone(
  section: CampaignConfigSectionId,
  input: PublishChecklistInput,
): boolean {
  return buildSectionChecklist(section, input).length === 0;
}

/** 发布前全量检查 = 各分区检查之和（进度与发布同一真相源） */
export function buildPublishChecklist(input: PublishChecklistInput): string[] {
  const errors: string[] = [];
  for (const s of CAMPAIGN_CONFIG_SECTIONS) {
    errors.push(...buildSectionChecklist(s.id, input));
  }
  return errors;
}

export function firstIncompleteSection(
  input: PublishChecklistInput,
): (typeof CAMPAIGN_CONFIG_SECTIONS)[number] | null {
  for (const s of CAMPAIGN_CONFIG_SECTIONS) {
    if (!campaignSectionDone(s.id, input)) return s;
  }
  return null;
}

/** 字段级必填/建议槽位（与发布检查对齐；blocking=false 不挡发布） */
export type RequiredSlot = {
  id: string;
  section: CampaignConfigSectionId;
  label: string;
  done: boolean;
  blocking: boolean;
  anchor: string;
};

export function buildRequiredSlots(input: PublishChecklistInput): RequiredSlot[] {
  const landing = input.landing || {};
  const templateId = input.templateId || '';
  const slots: RequiredSlot[] = [];

  slots.push({
    id: 'name',
    section: 'basic',
    label: '活动名称',
    done: Boolean(input.name?.trim()),
    blocking: true,
    anchor: 'ops-sec-basic',
  });

  if (templateId === 'multi_day' || templateId === 'memory' || templateId === 'verse_day') {
    const days = landing.days || [];
    const filled = days.some((d) => (d.body || '').trim() || (d.verseRef || '').trim());
    slots.push({
      id: 'days',
      section: 'content',
      label: templateId === 'memory' ? '至少一节背诵经文' : '至少一天日课内容',
      done: filled,
      blocking: true,
      anchor: 'ops-sec-content',
    });
    slots.push({
      id: 'intro',
      section: 'content',
      label: '活动说明（建议）',
      done: Boolean((landing.body || '').trim()),
      blocking: false,
      anchor: 'ops-sec-content',
    });
  } else if (templateId === 'gathering') {
    const schedule = landing.schedule;
    slots.push({
      id: 'sched_time',
      section: 'content',
      label: '聚会开始时间',
      done: Boolean((schedule?.startsAt || '').trim()),
      blocking: true,
      anchor: 'ops-sec-content',
    });
    slots.push({
      id: 'sched_place',
      section: 'content',
      label: '地点或线上说明',
      done:
        Boolean((schedule?.location || '').trim()) ||
        Boolean((schedule?.onlineNote || '').trim()),
      blocking: true,
      anchor: 'ops-sec-content',
    });
  } else if (templateId === 'serve') {
    const valid = (landing.slots || []).some((s) => (s.title || '').trim() && (s.limit || 0) > 0);
    slots.push({
      id: 'slots',
      section: 'content',
      label: '至少一个有名额岗位',
      done: valid,
      blocking: true,
      anchor: 'ops-sec-content',
    });
  } else if (templateId === 'hub') {
    const valid = (landing.entries || []).filter(
      (e) => (e.title || '').trim() && (e.href || '').trim(),
    );
    slots.push({
      id: 'entries',
      section: 'content',
      label: '至少 2 个入口',
      done: valid.length >= 2,
      blocking: true,
      anchor: 'ops-sec-content',
    });
  } else if (
    templateId === 'promo' ||
    templateId === 'season' ||
    templateId === 'prayer_drive' ||
    templateId === 'welcome' ||
    templateId === 'testify'
  ) {
    slots.push({
      id: 'body',
      section: 'content',
      label: '活动说明',
      done: Boolean((landing.body || '').trim()),
      blocking: true,
      anchor: 'ops-sec-content',
    });
  } else if (templateId === 'blank') {
    slots.push({
      id: 'intro',
      section: 'content',
      label: '主文案（建议）',
      done: Boolean((landing.body || '').trim()),
      blocking: false,
      anchor: 'ops-sec-content',
    });
  }

  const mode = input.audienceMode || 'groups';
  if (mode === 'all' || mode === 'admin_preview') {
    slots.push({
      id: 'audience_admin',
      section: 'audience',
      label: '超管受众权限',
      done: Boolean(input.isPlatformAdmin),
      blocking: true,
      anchor: 'ops-sec-audience',
    });
  } else {
    slots.push({
      id: 'audience_groups',
      section: 'audience',
      label: '至少一个可见群',
      done: Boolean(input.groupIds?.length),
      blocking: true,
      anchor: 'ops-sec-audience',
    });
  }

  const start = (input.startAt || '').trim();
  const end = (input.endAt || '').trim();
  const s = start ? parseLocalOrIso(start) : NaN;
  const e = end ? parseLocalOrIso(end) : NaN;
  slots.push({
    id: 'schedule',
    section: 'exposure',
    label: '开始与结束时间',
    done: Boolean(start && end && !Number.isNaN(s) && !Number.isNaN(e) && e > s),
    blocking: true,
    anchor: 'ops-sec-exposure',
  });
  if (input.railEnabled !== false) {
    const slot = Number(input.railSlot || 0);
    slots.push({
      id: 'rail',
      section: 'exposure',
      label: '今日推荐位置',
      done: slot >= 1 && slot <= 3,
      blocking: true,
      anchor: 'ops-sec-exposure',
    });
  }

  return slots;
}

export function blockingSlotsPending(slots: RequiredSlot[]): RequiredSlot[] {
  return slots.filter((s) => s.blocking && !s.done);
}

export function chinaYmd(d = new Date()): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(d);
}

/** 按活动开始日计算已解锁到第几天（by_start） */
export function unlockedDayCap(
  startAtIso: string | undefined,
  dayUnlock: string | undefined,
  daysTotal: number,
): number {
  if (dayUnlock !== 'by_start' || daysTotal <= 0) return daysTotal;
  if (!startAtIso) return daysTotal;
  const start = chinaYmd(new Date(startAtIso));
  const today = chinaYmd();
  if (today < start) return 0;
  const startDate = new Date(`${start}T00:00:00+08:00`);
  const todayDate = new Date(`${today}T00:00:00+08:00`);
  const diff = Math.floor((todayDate.getTime() - startDate.getTime()) / 86400000) + 1;
  return Math.min(daysTotal, Math.max(0, diff));
}

export function campaignShareUrl(campaignId: string, day?: number): string {
  if (typeof window === 'undefined') return `/campaigns/view/${campaignId}`;
  const u = new URL(`/campaigns/view/${campaignId}`, window.location.origin);
  if (day) u.searchParams.set('day', String(day));
  return u.toString();
}

/** 创建者预览链（草稿也可看） */
export function campaignPreviewUrl(campaignId: string): string {
  if (typeof window === 'undefined') return `/campaigns/view/${campaignId}?preview=1`;
  const u = new URL(`/campaigns/view/${campaignId}`, window.location.origin);
  u.searchParams.set('preview', '1');
  return u.toString();
}

export async function shareCampaignLink(opts: {
  campaignId: string;
  title: string;
  body?: string;
  day?: number;
}): Promise<'shared' | 'copied' | 'failed'> {
  const url = campaignShareUrl(opts.campaignId, opts.day);
  const text = `${opts.title}\n${url}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: opts.title, text: opts.body || opts.title, url });
      return 'shared';
    }
  } catch {
    /* fallthrough */
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    /* fallthrough */
  }
  try {
    await shareCard({
      title: opts.title,
      body: (opts.body || '邀请你一起参加群活动').slice(0, 120),
      footer: BRAND_NAME,
    });
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}

export function parseDaysFromBulkText(raw: string): Array<{
  day: number;
  title: string;
  body: string;
  verseRef: string;
  discussionHint: string;
}> {
  const parts = raw
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.map((block, i) => {
    const lines = block.split('\n');
    return {
      day: i + 1,
      title: lines[0] || `第 ${i + 1} 天`,
      body: lines.slice(1).join('\n').trim() || lines[0] || '',
      verseRef: '',
      discussionHint: '',
    };
  });
}

export function formatCountdown(targetIso: string | undefined): string | null {
  if (!targetIso) return null;
  const target = new Date(targetIso).getTime();
  if (Number.isNaN(target)) return null;
  const diff = target - Date.now();
  if (diff <= 0) return '已开始';
  const sec = Math.floor(diff / 1000);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d} 天 ${h} 小时后`;
  if (h > 0) return `${h} 小时 ${m} 分钟后`;
  return `${m} 分钟后`;
}

export function formatRelativeTime(iso?: string | null): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  return new Date(iso).toLocaleDateString('zh-CN');
}

export function campaignStatusLabel(status: string): string {
  if (status === 'published') return '已发布';
  if (status === 'ended') return '已结束';
  if (status === 'disabled') return '已停用';
  return '草稿';
}

export function campaignStatusTone(status: string): 'live' | 'draft' | 'ended' | 'off' {
  if (status === 'published') return 'live';
  if (status === 'ended') return 'ended';
  if (status === 'disabled') return 'off';
  return 'draft';
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
