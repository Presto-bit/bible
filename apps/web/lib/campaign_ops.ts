/** 活动运营前端辅助：发布检查清单、日课解锁文案等 */

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
};

export function buildPublishChecklist(input: PublishChecklistInput): string[] {
  const errors: string[] = [];
  const mode = input.audienceMode || 'groups';
  if (mode === 'all' || mode === 'admin_preview') {
    if (!input.isPlatformAdmin) errors.push('仅平台超管可发布全站/预览受众');
  } else if (!input.groupIds?.length) {
    errors.push('请选择谁能看见（至少一个群）');
  }
  if (!input.name?.trim()) errors.push('请填写活动名称');
  const title = (input.landing?.title || input.name || '').trim();
  if (!title) errors.push('请填写页面标题');
  const days = input.landing?.days || [];
  if (input.templateId === 'multi_day' || input.templateId === 'memory') {
    const filled = days.filter(
      (d) => (d.body || '').trim() || (d.verseRef || '').trim(),
    );
    if (!filled.length) errors.push('日课/经文清单至少填写一天内容');
  }
  if (input.templateId === 'gathering') {
    const schedule = input.landing?.schedule;
    if (!(schedule?.startsAt || '').trim() && !(schedule?.location || '').trim()) {
      errors.push('聚会请填写时间或地点');
    }
  }
  if (input.templateId === 'serve') {
    const slots = input.landing?.slots || [];
    const valid = slots.filter((s) => (s.title || '').trim() && (s.limit || 0) > 0);
    if (!valid.length) errors.push('服事招募请至少配置一个有名额的岗位');
  }
  if (input.templateId === 'hub') {
    const entries = input.landing?.entries || [];
    const valid = entries.filter((e) => (e.title || '').trim() && (e.href || '').trim());
    if (valid.length < 2) errors.push('多入口请至少配置 2 个有效入口（标题+链接）');
  }
  return errors;
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

