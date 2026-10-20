/** 邀请码活动外站（genesis-50 / hebrews-30 等 pages.dev）免改对方代码的自动进入。
 *
 * 对方站点用邀请码换固定邮箱/密码登录 Supabase。我们在本域完成登录后，
 * 把 session 写进目标站 URL query（其 supabase-js detectSessionInUrl 会接收），
 * 从而跳过邀请码输入页。PWA 用壳内 iframe 直链活动站；token 放 query（不用 hash）。
 * 手动登录在彼爱壳内同源完成（一次点击），避免 iframe 内外站登录要点两次。
 *
 * 注意：同一邀请码对应同一账号；全员共用一码会进同一账号。
 */

import { getUserName } from '@/lib/api';
import { clientWithBasePath } from '@/lib/basePath';
import { isFlutterH5Host } from '@/lib/flutter_h5_bridge';
import { openExternalBrowser } from '@/lib/external_browser';
import { friendlyError } from '@/lib/friendly_error';

const G50_HOST = 'genesis-50.pages.dev';
const HEBREWS30_HOST = 'hebrews-30.pages.dev';

/** 走同一 Supabase 邀请码鉴权的外站域名 */
const INVITE_CAMPAIGN_HOSTS = [G50_HOST, HEBREWS30_HOST] as const;
const G50_SUPABASE_URL = 'https://ytiwfmufekvxdgyaokae.supabase.co';
/** 与安卓一致：先走彼爱同源转发，避免新系统 Safari 直连 Supabase 预检被掐成 Load failed */
const INVITE_PROXY_API = '/campaigns/embed/hebrews-30/api';
const INVITE_NETWORK_ERROR = '网络不太稳定，请检查连接后重试';
const INVITE_CREDENTIAL_ERROR = '邀请码不正确';
/** 同源桥接页：安卓 WebView 先打开彼爱域，再 replace 到外站（与 PWA iframe 鉴权同路径） */
export const GENESIS50_BRIDGE_PATH = '/campaigns/genesis-50/enter';
/** 对方前端公开 anon key（与 genesis-50 包内一致） */
const G50_ANON_KEY = 'sb_publishable_aH3DWsTgZ4X0A4W_zJmyzw_wd7yk7pm';
/** 运营未在链接里带 ?code= 时的默认邀请码 */
const G50_DEFAULT_CODE = '0CIW43NR';
/** 用户上次成功使用的邀请码（本机） */
const INVITE_CODE_STORAGE_KEY = 'peiai.inviteCampaignCode.v1';

export type G50Session = {
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

function authHeaders(bearer?: string): Record<string, string> {
  return {
    apikey: G50_ANON_KEY,
    Authorization: `Bearer ${bearer || G50_ANON_KEY}`,
    'Content-Type': 'application/json',
  };
}

type InviteAuthPayload = Partial<G50Session> & {
  error?: string;
  error_description?: string;
  msg?: string;
  message?: string;
};

function inviteAuthBases(): string[] {
  const proxy = clientWithBasePath(INVITE_PROXY_API).replace(/\/$/, '');
  return proxy === G50_SUPABASE_URL ? [G50_SUPABASE_URL] : [proxy, G50_SUPABASE_URL];
}

/** 代理已经问到 Supabase 并得到明确拒绝时，不再改走直连。 */
function isDefinitiveAuthStatus(status: number): boolean {
  return status === 400 || status === 401 || status === 403 || status === 409 || status === 422;
}

async function readAuthPayload(res: Response): Promise<InviteAuthPayload> {
  try {
    return (await res.json()) as InviteAuthPayload;
  } catch {
    return {};
  }
}

function sessionFromPayload(data: InviteAuthPayload): G50Session | null {
  if (!data.access_token || !data.refresh_token) return null;
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in,
    expires_at: data.expires_at,
    token_type: data.token_type,
  };
}

async function postInviteAuth(
  path: string,
  body: unknown,
  headers: Record<string, string>,
): Promise<{ res: Response; data: InviteAuthPayload }> {
  for (const base of inviteAuthBases()) {
    try {
      const res = await fetch(`${base}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        cache: 'no-store',
      });
      if (res.ok || isDefinitiveAuthStatus(res.status)) {
        return { res, data: await readAuthPayload(res) };
      }
    } catch {
      /* 连接被掐断时换下一条；凭证错误已在上面返回 */
    }
  }
  throw new Error(INVITE_NETWORK_ERROR);
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
  const path =
    typeof window !== 'undefined'
      ? clientWithBasePath(GENESIS50_BRIDGE_PATH)
      : GENESIS50_BRIDGE_PATH;
  const u = new URL(path, origin);
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

/** 当前页是否为邀请活动同源桥接（鉴权中转，不应弹「已有账号」等壳层干扰） */
export function isGenesis50BridgeLocation(): boolean {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname.replace(/\/$/, '');
  const bridge = clientWithBasePath(GENESIS50_BRIDGE_PATH).replace(/\/$/, '');
  return path === bridge;
}

export function rememberGenesis50InviteCode(code: string): void {
  const c = (code || '').trim().toUpperCase();
  if (!c || typeof window === 'undefined') return;
  try {
    localStorage.setItem(INVITE_CODE_STORAGE_KEY, c);
  } catch {
    /* ignore */
  }
}

export function readRememberedGenesis50InviteCode(): string {
  if (typeof window === 'undefined') return '';
  try {
    return (localStorage.getItem(INVITE_CODE_STORAGE_KEY) || '').trim().toUpperCase();
  } catch {
    return '';
  }
}

/** 优先级：链接 ?code= → 本机上次成功码 → 默认码 */
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
  const remembered = readRememberedGenesis50InviteCode();
  if (remembered) return remembered;
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
  const { res, data } = await postInviteAuth(
    '/auth/v1/token?grant_type=password',
    { email: inviteEmail(code), password: invitePassword(code) },
    authHeaders(),
  );
  const session = sessionFromPayload(data);
  if (res.ok && session) return session;
  if (isDefinitiveAuthStatus(res.status)) throw new Error(INVITE_CREDENTIAL_ERROR);
  throw new Error(INVITE_NETWORK_ERROR);
}

async function signUpWithInvite(code: string, nickname: string): Promise<G50Session> {
  const { res, data } = await postInviteAuth(
    '/auth/v1/signup',
    {
      email: inviteEmail(code),
      password: invitePassword(code),
      data: { nickname },
    },
    authHeaders(),
  );
  const session = sessionFromPayload(data);
  if (!res.ok || !session) {
    if (isDefinitiveAuthStatus(res.status)) throw new Error(INVITE_CREDENTIAL_ERROR);
    throw new Error(INVITE_NETWORK_ERROR);
  }
  // 对方站点注册后会调 complete_registration；尽量补齐，失败不阻断进入
  try {
    await postInviteAuth(
      '/rest/v1/rpc/complete_registration',
      {
        invite_code: code.trim().toUpperCase(),
        user_nickname: nickname.trim() || '同行者',
      },
      {
        ...authHeaders(session.access_token),
        Prefer: 'return=minimal',
      },
    );
  } catch {
    /* ignore */
  }
  return session;
}

export function inviteCampaignEnterErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  if (raw.includes(INVITE_CREDENTIAL_ERROR)) return INVITE_CREDENTIAL_ERROR;
  const friendly = friendlyError(err, '进入失败，请检查邀请码后重试');
  if (friendly === INVITE_NETWORK_ERROR) return friendly;
  if (/invalid login|invalid_grant|credential|unauthorized|登录失败|注册失败/i.test(raw)) {
    return INVITE_CREDENTIAL_ERROR;
  }
  return friendly;
}

export function buildGenesis50AuthedUrl(href: string, session: G50Session): string {
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

/** @deprecated 用 buildGenesis50AuthedUrl */
function buildAuthedUrl(href: string, session: G50Session): string {
  return buildGenesis50AuthedUrl(href, session);
}

export async function obtainGenesis50Session(code: string): Promise<G50Session> {
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

/**
 * PWA iframe 打开地址：活动站直链 + token。
 * 曾用同站 embed 抑制引导弹窗，但与对方 SPA 路由冲突会出现「空白→有内容→再空白」，故改回直链。
 */
export function buildGenesis50PwaOpenUrl(href: string, session: G50Session): string {
  return buildGenesis50AuthedUrl(href, session);
}

/** 壳内邀请码一次进入：本域换 session 后返回可嵌入的 URL。 */
export async function resolveInviteCampaignEnterUrl(
  href: string,
  code: string,
): Promise<string> {
  const normalized = code.trim().toUpperCase();
  const session = await obtainGenesis50Session(normalized);
  rememberGenesis50InviteCode(normalized);
  return buildGenesis50PwaOpenUrl(normalizeHref(href), session);
}

/** 解析可打开的创世记 50 URL（桥接页 / PWA 共用）。 */
export async function resolveGenesis50OpenUrl(href: string): Promise<string> {
  const fallback = normalizeHref(href);
  const code = resolveGenesis50InviteCode(href);
  try {
    const session = await obtainGenesis50Session(code);
    return buildAuthedUrl(fallback, session);
  } catch {
    try {
      const u = new URL(fallback);
      if (!u.searchParams.get('code') && !u.searchParams.get('invite')) {
        u.searchParams.set('code', code);
      }
      return u.toString();
    } catch {
      return fallback;
    }
  }
}

/** 应用内打开：PWA 壳内 iframe 预鉴权；Flutter 壳走同源桥接页。 */
export function openGenesis50Authed(href: string): void {
  if (typeof window === 'undefined') return;
  const title = inviteCampaignDisplayTitle(href);

  if (isFlutterH5Host()) {
    openExternalBrowser({
      url: buildGenesis50BridgeUrl(href),
      title,
      loading: true,
      chrome: 'app',
    });
    return;
  }

  const code = resolveGenesis50InviteCode(href);
  const fallback = normalizeHref(href);
  const inviteCampaign = { href: fallback, code };

  openExternalBrowser({
    title,
    loading: true,
    chrome: 'app',
    inviteCampaign,
  });

  void (async () => {
    try {
      const session = await obtainGenesis50Session(code);
      rememberGenesis50InviteCode(code);
      openExternalBrowser({
        url: buildGenesis50PwaOpenUrl(fallback, session),
        title,
        loading: false,
        chrome: 'app',
        inviteCampaign,
      });
    } catch (err) {
      console.warn('[genesis50] auto enter failed, show in-shell invite form', err);
      // 不打开外站邀请页（iframe 内登录常需点两次）；改用彼爱壳内同源表单
      openExternalBrowser({
        url: '',
        title,
        loading: false,
        chrome: 'app',
        inviteCampaign,
        inviteForm: true,
      });
    }
  })();
}
