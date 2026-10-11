/** 邀请码活动外站（genesis-50 / hebrews-30 等 pages.dev）免改对方代码的自动进入。
 *
 * 对方站点用邀请码换固定邮箱/密码登录 Supabase。我们在本域完成登录后，
 * 把 session 写进目标站 URL query（其 supabase-js detectSessionInUrl 会接收），
 * 从而跳过邀请码输入页。iOS PWA iframe 常丢弃 hash，故不用 fragment。
 *
 * 注意：同一邀请码对应同一账号；全员共用一码会进同一账号。
 */

import { getUserName } from '@/lib/api';
import { openExternalBrowser } from '@/lib/external_browser';

const G50_HOST = 'genesis-50.pages.dev';
const HEBREWS30_HOST = 'hebrews-30.pages.dev';

/** 走同一 Supabase 邀请码鉴权的外站域名 */
const INVITE_CAMPAIGN_HOSTS = [G50_HOST, HEBREWS30_HOST] as const;
const G50_SUPABASE_URL = 'https://ytiwfmufekvxdgyaokae.supabase.co';
/** 同源桥接页：安卓 WebView 先打开彼爱域，再 replace 到外站（与 PWA iframe 鉴权同路径） */
export const GENESIS50_BRIDGE_PATH = '/campaigns/genesis-50/enter';
/** 对方前端公开 anon key（与 genesis-50 包内一致） */
const G50_ANON_KEY = 'sb_publishable_aH3DWsTgZ4X0A4W_zJmyzw_wd7yk7pm';
/** 运营未在链接里带 ?code= 时的默认邀请码 */
const G50_DEFAULT_CODE = '0CIW43NR';

type G50Session = {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  expires_at?: number;
  token_type?: string;
};

export function normalizeGenesis50Href(href: string): string {
  const t = (href || '').trim();
  if (!t) return '';
  if (t.startsWith('//')) return `https:${t}`;
  return t;
}

/** @deprecated 内部别名 */
function normalizeHref(href: string): string {
  return normalizeGenesis50Href(href);
}

function authHeaders(): HeadersInit {
  return {
    apikey: G50_ANON_KEY,
    Authorization: `Bearer ${G50_ANON_KEY}`,
    'Content-Type': 'application/json',
  };
}

function isInviteCampaignHost(hostname: string): boolean {
  const host = (hostname || '').trim().toLowerCase();
  if (!host) return false;
  return INVITE_CAMPAIGN_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

/** 邀请码活动外站（含希伯来书 30 天 hebrews-30.pages.dev） */
export function isGenesis50Href(href: string): boolean {
  const t = (href || '').trim().toLowerCase();
  if (t.includes('genesis-50') || t.includes('genesis50')) return true;
  if (t.includes('hebrews-30') || t.includes('hebrews30')) return true;
  try {
    const u = new URL(normalizeHref(href));
    return isInviteCampaignHost(u.hostname);
  } catch {
    return false;
  }
}

export function inviteCampaignDisplayTitle(href: string): string {
  const t = (href || '').trim().toLowerCase();
  if (t.includes('hebrews-30') || t.includes('hebrews30') || t.includes('hebrews')) {
    return '希伯来书 30 天';
  }
  try {
    const u = new URL(normalizeHref(href));
    if (isInviteCampaignHost(u.hostname) && u.hostname.includes('hebrews')) {
      return '希伯来书 30 天';
    }
  } catch {
    /* ignore */
  }
  return '创世记 50 天';
}

/** 安卓壳 / WebView：先打开同源桥接页，由页内 JS 完成 Supabase 鉴权再跳转外站。 */
export function buildGenesis50BridgeUrl(href: string): string {
  const target = normalizeHref(href);
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://2sc.prestoai.cn';
  const u = new URL(GENESIS50_BRIDGE_PATH, origin);
  if (target) u.searchParams.set('href', target);
  return u.toString();
}

export function isGenesis50BridgeHref(href: string): boolean {
  try {
    const u = new URL(normalizeHref(href));
    return u.pathname.replace(/\/$/, '') === GENESIS50_BRIDGE_PATH;
  } catch {
    return false;
  }
}

export function resolveGenesis50InviteCode(href: string): string {
  try {
    const u = new URL(normalizeHref(href));
    const fromQs = (u.searchParams.get('code') || u.searchParams.get('invite') || '')
      .trim()
      .toUpperCase();
    if (fromQs) return fromQs;
  } catch {
    /* ignore */
  }
  return G50_DEFAULT_CODE;
}

function inviteEmail(code: string): string {
  return `${code.trim().toLowerCase()}@invite.local`;
}

function invitePassword(code: string): string {
  return `G50-${code.trim().toUpperCase()}`;
}

function guessNickname(): string {
  if (typeof window === 'undefined') return '同行者';
  try {
    const fromProfile = (getUserName() || '').trim();
    if (fromProfile && fromProfile.length <= 20) return fromProfile;
  } catch {
    /* ignore */
  }
  return '同行者';
}

async function signInWithInvite(code: string): Promise<G50Session> {
  const res = await fetch(`${G50_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      email: inviteEmail(code),
      password: invitePassword(code),
    }),
  });
  const data = (await res.json()) as G50Session & {
    error?: string;
    error_description?: string;
    msg?: string;
  };
  if (!res.ok || !data.access_token || !data.refresh_token) {
    throw new Error(data.error_description || data.msg || data.error || '登录失败');
  }
  return data;
}

async function signUpWithInvite(code: string, nickname: string): Promise<G50Session> {
  const res = await fetch(`${G50_SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      email: inviteEmail(code),
      password: invitePassword(code),
      data: { nickname },
    }),
  });
  const data = (await res.json()) as G50Session & {
    user?: { id?: string };
    error?: string;
    error_description?: string;
    msg?: string;
    message?: string;
  };
  if (!res.ok || !data.access_token || !data.refresh_token) {
    throw new Error(
      data.error_description || data.msg || data.message || data.error || '注册失败',
    );
  }
  // 对方站点注册后会调 complete_registration；尽量补齐，失败不阻断进入
  try {
    await fetch(`${G50_SUPABASE_URL}/rest/v1/rpc/complete_registration`, {
      method: 'POST',
      headers: {
        ...authHeaders(),
        Authorization: `Bearer ${data.access_token}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        invite_code: code.trim().toUpperCase(),
        user_nickname: nickname.trim() || '同行者',
      }),
    });
  } catch {
    /* ignore */
  }
  return data;
}

function buildAuthedUrl(href: string, session: G50Session): string {
  const u = new URL(normalizeHref(href));
  u.hash = '';
  // 清掉邀请参数，避免进入后又停在邀请码页
  u.searchParams.delete('code');
  u.searchParams.delete('invite');
  // 用 query 而不是 hash：iOS PWA iframe 经常丢弃 fragment，导致对方 detectSessionInUrl 失败、又要求填邀请码
  u.searchParams.set('access_token', session.access_token);
  u.searchParams.set('refresh_token', session.refresh_token);
  u.searchParams.set('expires_in', String(session.expires_in ?? 3600));
  u.searchParams.set('token_type', session.token_type || 'bearer');
  u.searchParams.set('type', 'magiclink');
  if (session.expires_at != null) {
    u.searchParams.set('expires_at', String(session.expires_at));
  }
  return u.toString();
}

async function obtainGenesis50Session(code: string): Promise<G50Session> {
  try {
    return await signInWithInvite(code);
  } catch (signInErr) {
    try {
      return await signUpWithInvite(code, guessNickname());
    } catch {
      // 邀请码已占用时注册会失败；再试一次登录（并发下首次登录也可能失败）
      try {
        return await signInWithInvite(code);
      } catch {
        throw signInErr;
      }
    }
  }
}

/** 鉴权失败时带邀请码 query，供用户手动进入活动站。 */
export function buildGenesis50FallbackUrl(href: string, code?: string): string {
  const fallback = normalizeHref(href);
  const invite = (code || resolveGenesis50InviteCode(href)).trim();
  try {
    const u = new URL(fallback);
    if (!u.searchParams.get('code') && !u.searchParams.get('invite') && invite) {
      u.searchParams.set('code', invite);
    }
    return u.toString();
  } catch {
    return fallback;
  }
}

export type ResolveGenesis50OpenOptions = {
  /** false：鉴权失败抛错（内嵌桥接页提示）；true：带邀请码兜底 URL（默认，供原生 Custom Tabs 等） */
  allowFallback?: boolean;
};

/** 解析可打开的创世记 50 URL（桥接页 / Custom Tabs 共用）。 */
export async function resolveGenesis50OpenUrl(
  href: string,
  options?: ResolveGenesis50OpenOptions,
): Promise<string> {
  const allowFallback = options?.allowFallback !== false;
  const fallback = normalizeHref(href);
  const code = resolveGenesis50InviteCode(href);
  try {
    const session = await obtainGenesis50Session(code);
    return buildAuthedUrl(fallback, session);
  } catch (err) {
    if (!allowFallback) {
      throw err instanceof Error ? err : new Error('自动进入失败');
    }
    return buildGenesis50FallbackUrl(fallback, code);
  }
}

/** 桥接页向内嵌浏览器父页上报状态（失败时可显示顶栏提示）。 */
export const GENESIS50_BRIDGE_MESSAGE = 'presto-genesis50-bridge';

export type Genesis50BridgeMessage = {
  type: typeof GENESIS50_BRIDGE_MESSAGE;
  status: 'opening' | 'error' | 'manual';
  message?: string;
};

export function postGenesis50BridgeMessage(payload: Omit<Genesis50BridgeMessage, 'type'>): void {
  if (typeof window === 'undefined' || window.parent === window) return;
  try {
    window.parent.postMessage(
      { type: GENESIS50_BRIDGE_MESSAGE, ...payload } satisfies Genesis50BridgeMessage,
      window.location.origin,
    );
  } catch {
    /* ignore */
  }
}

/** 应用内打开：内嵌全屏 + 同源桥接页鉴权（与 Android WebView 路径一致，无系统浏览器 chrome）。 */
export function openGenesis50Authed(href: string): void {
  if (typeof window === 'undefined') return;
  const title = inviteCampaignDisplayTitle(href);
  openExternalBrowser({
    url: buildGenesis50BridgeUrl(href),
    title,
    loading: false,
    chrome: 'app',
  });
}
