/** 活动落地页 / 推荐卡外链导航（无二次确认；外链走 PWA 内嵌浏览器） */

import { openExternalBrowser } from '@/lib/external_browser';
import { isGenesis50Href, openGenesis50Authed } from '@/lib/genesis50_auth';

export function isExternalHref(href: string): boolean {
  const t = (href || '').trim();
  if (!t) return false;
  if (t.startsWith('/') && !t.startsWith('//')) return false;
  return /^https?:\/\//i.test(t) || t.startsWith('//');
}

export function normalizeCampaignHref(href: string): string {
  const t = (href || '').trim();
  if (!t) return '';
  if (t.startsWith('//')) return `https:${t}`;
  return t;
}

function titleFromHref(href: string): string {
  try {
    return new URL(href).hostname.replace(/^www\./, '') || '外部页面';
  } catch {
    return '外部页面';
  }
}

/** 站内直跳；外链内嵌打开（创世记走自动登录）。返回是否已导航。 */
export function openCampaignHref(href: string): boolean {
  const raw = normalizeCampaignHref(href);
  if (!raw) return false;
  if (!isExternalHref(raw)) {
    if (typeof window !== 'undefined') window.location.assign(raw);
    return true;
  }
  if (isGenesis50Href(raw)) {
    openGenesis50Authed(raw);
    return true;
  }
  openExternalBrowser({ url: raw, title: titleFromHref(raw) });
  return true;
}

/** 按模板给出主按钮默认（成员打开落地页时的行动，无需运营手填链接） */
export function defaultPrimaryCta(
  templateId: string,
  campaignId?: string,
): { label: string; href: string } {
  const self = campaignId ? `/campaigns/view/${campaignId}` : '';
  switch (templateId) {
    case 'blank':
      return { label: '查看活动', href: self || '/' };
    case 'multi_day':
    case 'memory':
      return { label: '开始今日阅读', href: self || '/reader' };
    case 'verse_day':
      return { label: '打开圣经', href: '/reader' };
    case 'gathering':
    case 'season':
      return { label: '查看详情', href: self || '/' };
    case 'prayer_drive':
      return { label: '提交代祷', href: self || '/' };
    case 'serve':
      return { label: '去报名', href: self || '/' };
    case 'welcome':
      return { label: '了解更多', href: '/' };
    case 'testify':
      return { label: '留下见证', href: self || '/' };
    case 'hub':
      return { label: '查看入口', href: self || '/' };
    case 'promo':
      return { label: '了解更多', href: '/' };
    default:
      return { label: '查看活动', href: self || '/' };
  }
}

/** 合并运营已有 CTA 与模板默认：缺省补全，不覆盖已有有效配置 */
export function resolvePrimaryCta(
  templateId: string,
  campaignId: string | undefined,
  current?: { label?: string; href?: string } | null,
): { label: string; href: string } {
  const fallback = defaultPrimaryCta(templateId, campaignId);
  const label = (current?.label || '').trim() || fallback.label;
  const href = (current?.href || '').trim() || fallback.href;
  return { label, href };
}

export const QUICK_HREFS: Array<{ label: string; href: string }> = [
  { label: '首页', href: '/' },
  { label: '读经', href: '/reader' },
  { label: '计划', href: '/plans' },
  { label: '发现', href: '/discover' },
  { label: '闯关', href: '/challenge' },
  { label: '小爱', href: '/assistant' },
];
