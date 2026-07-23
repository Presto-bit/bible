/** 活动落地页链接安全导航 */

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

/** 站内直跳；外链二次确认。返回是否已导航。 */
export function openCampaignHref(href: string): boolean {
  const raw = normalizeCampaignHref(href);
  if (!raw) return false;
  if (!isExternalHref(raw)) {
    if (typeof window !== 'undefined') window.location.assign(raw);
    return true;
  }
  const ok = window.confirm(
    `即将打开外部链接，请确认来源可信：\n\n${raw}\n\n是否继续？`,
  );
  if (!ok) return false;
  window.open(raw, '_blank', 'noopener,noreferrer');
  return true;
}

export const QUICK_HREFS: Array<{ label: string; href: string }> = [
  { label: '首页', href: '/' },
  { label: '读经', href: '/reader' },
  { label: '计划', href: '/plans' },
  { label: '发现', href: '/discover' },
  { label: '闯关', href: '/challenge' },
  { label: '小爱', href: '/assistant' },
];
