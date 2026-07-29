/** 创世记 50 天（genesis-50.pages.dev）免改对方代码的自动进入。
 *
 * 对方站点用邀请码换固定邮箱/密码登录 Supabase。我们在本域完成登录后，
 * 把 session 写进目标站 URL hash（其 supabase-js detectSessionInUrl 会接收），
 * 从而跳过邀请码输入页。
 *
 * 注意：同一邀请码对应同一账号；全员共用一码会进同一账号。
 */

import { getUserName } from '@/lib/api';

const G50_HOST = 'genesis-50.pages.dev';
const G50_SUPABASE_URL = 'https://ytiwfmufekvxdgyaokae.supabase.co';
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

function normalizeHref(href: string): string {
  const t = (href || '').trim();
  if (!t) return '';
  if (t.startsWith('//')) return `https:${t}`;
  return t;
}

function authHeaders(): HeadersInit {
  return {
    apikey: G50_ANON_KEY,
    Authorization: `Bearer ${G50_ANON_KEY}`,
    'Content-Type': 'application/json',
  };
}

export function isGenesis50Href(href: string): boolean {
  try {
    const u = new URL(normalizeHref(href));
    return u.hostname === G50_HOST || u.hostname.endsWith(`.${G50_HOST}`);
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
  // 清掉 code，避免对方若以后支持 query 时重复处理
  u.searchParams.delete('code');
  u.searchParams.delete('invite');
  const params = new URLSearchParams({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: String(session.expires_in ?? 3600),
    token_type: session.token_type || 'bearer',
    type: 'magiclink',
  });
  if (session.expires_at != null) params.set('expires_at', String(session.expires_at));
  u.hash = params.toString();
  return u.toString();
}

async function obtainGenesis50Session(code: string): Promise<G50Session> {
  try {
    return await signInWithInvite(code);
  } catch {
    return await signUpWithInvite(code, guessNickname());
  }
}

/** 同步占坑打开窗口，再写入带 session 的地址（避免弹窗拦截；无确认框）。 */
export function openGenesis50Authed(href: string): void {
  if (typeof window === 'undefined') return;
  const code = resolveGenesis50InviteCode(href);
  const fallback = normalizeHref(href);
  const popup = window.open('about:blank', '_blank');

  void (async () => {
    try {
      const session = await obtainGenesis50Session(code);
      const url = buildAuthedUrl(fallback, session);
      if (popup && !popup.closed) {
        popup.location.replace(url);
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      console.warn('[genesis50] auto enter failed, fallback plain open', err);
      if (popup && !popup.closed) {
        popup.location.replace(fallback);
      } else {
        window.open(fallback, '_blank', 'noopener,noreferrer');
      }
    }
  })();
}
