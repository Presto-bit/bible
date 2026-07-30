/** 活动落地页 / 推荐卡 / IM 链接导航（站内同窗；真外链走内嵌浏览器） */

import { clientBasePath, clientWithBasePath } from '@/lib/basePath';
import { openExternalBrowser } from '@/lib/external_browser';
import { isGenesis50Href, openGenesis50Authed } from '@/lib/genesis50_auth';
import { canonicalShareOrigin } from '@/lib/share_site';

export function normalizeCampaignHref(href: string): string {
  const t = (href || '').trim();
  if (!t) return '';
  if (t.startsWith('//')) return `https:${t}`;
  return t;
}

/** 本站主机名（忽略 www / 协议）；含当前页与 canonical */
function appHostnames(): Set<string> {
  const hosts = new Set<string>();
  const add = (host: string) => {
    const h = (host || '').trim().toLowerCase();
    if (!h) return;
    hosts.add(h);
    hosts.add(h.replace(/^www\./, ''));
    if (!h.startsWith('www.')) hosts.add(`www.${h}`);
  };
  try {
    add(new URL(canonicalShareOrigin()).hostname);
  } catch {
    add('2sc.prestoai.cn');
  }
  add('2sc.prestoai.cn');
  add('prestoai.cn');
  if (typeof window !== 'undefined' && window.location?.hostname) {
    add(window.location.hostname);
  }
  add('localhost');
  add('127.0.0.1');
  return hosts;
}

function isAppHostname(hostname: string): boolean {
  const h = (hostname || '').trim().toLowerCase();
  if (!h) return false;
  const allowed = appHostnames();
  return allowed.has(h) || allowed.has(h.replace(/^www\./, ''));
}

/** 去掉历史 /2sc 前缀与运行时 basePath，得到应用内 path */
export function stripAppBasePath(pathname: string): string {
  let p = pathname || '/';
  if (!p.startsWith('/')) p = `/${p}`;
  const bases = new Set<string>();
  bases.add('/2sc');
  const runtime = clientBasePath();
  if (runtime) bases.add(runtime.replace(/\/$/, '') || runtime);
  for (const base of bases) {
    if (!base || base === '/') continue;
    if (p === base) return '/';
    if (p.startsWith(`${base}/`)) {
      p = p.slice(base.length) || '/';
      break;
    }
  }
  return p || '/';
}

/**
 * 若链接属于本站（相对路径或本产品域名），返回应用内 path+query+hash；
 * 否则返回 null（真外链）。
 * 用 hostname 判断，避免 http/https、www 不一致误判为外链。
 */
export function toInternalAppPath(href: string): string | null {
  const t = normalizeCampaignHref(href);
  if (!t) return null;
  if (t.startsWith('/') && !t.startsWith('//')) {
    const u = new URL(t, 'https://local.invalid');
    return `${stripAppBasePath(u.pathname)}${u.search}${u.hash}` || '/';
  }
  try {
    const base =
      typeof window !== 'undefined' ? window.location.href : `${canonicalShareOrigin()}/`;
    const u = new URL(t, base);
    if (!isAppHostname(u.hostname)) return null;
    const path = `${stripAppBasePath(u.pathname)}${u.search}${u.hash}`;
    return path || '/';
  } catch {
    return null;
  }
}

/** 真外链（需内嵌浏览器 / 系统浏览器）；同域绝对 URL 不算外链 */
export function isExternalHref(href: string): boolean {
  const t = normalizeCampaignHref(href);
  if (!t) return false;
  return toInternalAppPath(t) == null;
}

function titleFromHref(href: string): string {
  try {
    return new URL(href).hostname.replace(/^www\./, '') || '外部页面';
  } catch {
    return '外部页面';
  }
}

function navigateInternal(path: string): void {
  if (typeof window === 'undefined') return;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  void import('@/lib/pwa_tab_nav').then(({ navigateAppHref }) => {
    navigateAppHref(normalized, {
      push: (url) => {
        const target = clientWithBasePath(url.startsWith('/') ? url : `/${url}`);
        // App Router 无稳定全局 router 时用同窗跳转，避免再套一层内嵌浏览器
        if (window.location.pathname + window.location.search + window.location.hash === target) {
          return;
        }
        window.location.assign(target);
      },
    });
  });
}

/**
 * 站内同窗跳转；真外链才开内嵌浏览器。
 * 若误把站内 URL 传入，仍会收成站内跳转（不露浏览器壳）。
 */
export function openCampaignHref(href: string): boolean {
  const raw = normalizeCampaignHref(href);
  if (!raw) return false;
  const internal = toInternalAppPath(raw);
  if (internal) {
    navigateInternal(internal);
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
