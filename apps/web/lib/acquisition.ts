/** 获客三级渠道：落地采参 → pending → 建档后 First Touch 绑定 */

import { API_BASE, authHeaders, effectiveId } from './api';
import { getDeviceId } from './device_id';

const PENDING_KEY = 'presto_acq_pending';
const BOUND_KEY = 'presto_acq_bound';

export type ChannelL1 = 'organic' | 'share' | 'campaign' | 'social' | 'ads' | 'unknown';

export type AcquisitionPayload = {
  channel_l1: ChannelL1;
  channel_l2: string;
  channel_l3: string;
  raw_params: Record<string, string>;
  landing_path: string;
  referrer_host: string;
  captured_at: string;
};

const L1_SET = new Set<string>(['organic', 'share', 'campaign', 'social', 'ads', 'unknown']);

const UTM_SOURCE_L1: Record<string, ChannelL1> = {
  wechat: 'share',
  weixin: 'share',
  wx: 'share',
  campaign: 'campaign',
  ads: 'ads',
  ad: 'ads',
  douyin: 'ads',
  xiaohongshu: 'ads',
  xhs: 'ads',
  group: 'social',
  invite: 'social',
};

const UTM_MEDIUM_L2: Record<string, string> = {
  group: 'wechat_group',
  moments: 'wechat_moments',
  friend: 'wechat_friend',
  friends: 'wechat_friend',
  share: 'system_share',
  cpc: 'wechat_ads',
  paid: 'wechat_ads',
  invite: 'group_invite',
  join: 'group_join',
};

function slug(value: string | null | undefined, maxLen: number): string {
  const raw = (value || '').trim().toLowerCase();
  if (!raw) return '';
  return raw
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_.:-]+/g, '')
    .slice(0, maxLen);
}

function normalizeL1(value: string | null | undefined): ChannelL1 {
  const s = slug(value, 32);
  if (L1_SET.has(s)) return s as ChannelL1;
  return value?.trim() ? 'unknown' : 'organic';
}

function referrerHost(): string {
  if (typeof document === 'undefined') return '';
  try {
    const ref = document.referrer || '';
    if (!ref) return '';
    return new URL(ref).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function isWechatHost(host: string): boolean {
  return (
    host.includes('weixin.qq.com') ||
    host.includes('wx.qq.com') ||
    host === 'mp.weixin.qq.com'
  );
}

function collectRawParams(search: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of ['ch1', 'ch2', 'ch3', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'code', 'join_code', 'from']) {
    const v = search.get(key);
    if (v) out[key] = v;
  }
  return out;
}

function fromExplicit(search: URLSearchParams): AcquisitionPayload | null {
  const ch1 = search.get('ch1');
  const ch2 = search.get('ch2');
  if (!ch1 && !ch2) return null;
  const l1 = normalizeL1(ch1 || 'unknown');
  return {
    channel_l1: l1,
    channel_l2: slug(ch2, 64) || (l1 === 'organic' ? 'direct' : ''),
    channel_l3: slug(search.get('ch3'), 128),
    raw_params: collectRawParams(search),
    landing_path: typeof location !== 'undefined' ? location.pathname : '',
    referrer_host: referrerHost(),
    captured_at: new Date().toISOString(),
  };
}

function fromUtm(search: URLSearchParams): AcquisitionPayload | null {
  const source = slug(search.get('utm_source'), 64);
  const medium = slug(search.get('utm_medium'), 64);
  const campaign = slug(search.get('utm_campaign'), 128);
  if (!source && !medium && !campaign) return null;
  const l1: ChannelL1 = UTM_SOURCE_L1[source] || (source || medium || campaign ? 'unknown' : 'organic');
  let l2 = UTM_MEDIUM_L2[medium] || '';
  if (!l2 && source === 'wechat') l2 = 'wechat_friend';
  if (!l2 && l1 === 'campaign') l2 = 'campaign_page';
  if (!l2 && l1 === 'ads') l2 = source || 'other_share';
  const l3 = campaign ? (campaign.startsWith('campaign:') ? campaign : `campaign:${campaign}`) : '';
  return {
    channel_l1: l1,
    channel_l2: l2,
    channel_l3: l3,
    raw_params: collectRawParams(search),
    landing_path: typeof location !== 'undefined' ? location.pathname : '',
    referrer_host: referrerHost(),
    captured_at: new Date().toISOString(),
  };
}

function fromPath(pathname: string, search: URLSearchParams): AcquisitionPayload | null {
  const campaignMatch = pathname.match(/^\/campaigns\/view\/([^/]+)/);
  if (campaignMatch?.[1]) {
    return {
      channel_l1: 'campaign',
      channel_l2: 'campaign_page',
      channel_l3: `campaign:${slug(campaignMatch[1], 120)}`,
      raw_params: collectRawParams(search),
      landing_path: pathname,
      referrer_host: referrerHost(),
      captured_at: new Date().toISOString(),
    };
  }
  if (pathname === '/discover/join' || pathname.startsWith('/discover/join')) {
    const code = slug(search.get('code') || search.get('join_code'), 64).toUpperCase();
    if (code) {
      return {
        channel_l1: 'social',
        channel_l2: 'group_join',
        channel_l3: `join:${code.toLowerCase()}`,
        raw_params: collectRawParams(search),
        landing_path: pathname,
        referrer_host: referrerHost(),
        captured_at: new Date().toISOString(),
      };
    }
  }
  return null;
}

function fromReferrer(): AcquisitionPayload | null {
  const host = referrerHost();
  if (!host) return null;
  if (isWechatHost(host)) {
    return {
      channel_l1: 'share',
      channel_l2: 'wechat_friend',
      channel_l3: '',
      raw_params: {},
      landing_path: typeof location !== 'undefined' ? location.pathname : '',
      referrer_host: host,
      captured_at: new Date().toISOString(),
    };
  }
  return null;
}

function organicDirect(): AcquisitionPayload {
  return {
    channel_l1: 'organic',
    channel_l2: 'direct',
    channel_l3: '',
    raw_params: {},
    landing_path: typeof location !== 'undefined' ? location.pathname : '',
    referrer_host: referrerHost(),
    captured_at: new Date().toISOString(),
  };
}

/** 按 R2 优先级解析当前落地页 */
export function resolveAcquisitionFromLocation(
  href?: string,
): AcquisitionPayload {
  if (typeof window === 'undefined') return organicDirect();
  let url: URL;
  try {
    url = new URL(href || window.location.href);
  } catch {
    return organicDirect();
  }
  const search = url.searchParams;
  return (
    fromExplicit(search) ||
    fromUtm(search) ||
    fromPath(url.pathname, search) ||
    fromReferrer() ||
    organicDirect()
  );
}

export function readPendingAcquisition(): AcquisitionPayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AcquisitionPayload;
    if (!parsed?.channel_l1) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** First Touch：本地 pending 只写一次 */
export function captureAcquisitionFromLocation(href?: string): AcquisitionPayload {
  const existing = readPendingAcquisition();
  if (existing) return existing;
  const next = resolveAcquisitionFromLocation(href);
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
  return next;
}

function markBoundLocally(userCode: string): void {
  try {
    localStorage.setItem(BOUND_KEY, userCode);
  } catch {
    /* ignore */
  }
}

function alreadyBoundLocally(userCode: string): boolean {
  try {
    return localStorage.getItem(BOUND_KEY) === userCode;
  } catch {
    return false;
  }
}

/** 建档有会话后，把 pending 绑定到 user_code（服务端幂等） */
export async function bindPendingAcquisition(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const code = effectiveId();
  if (!code) return false;
  if (alreadyBoundLocally(code)) return true;

  // 确保有 pending（老会话重进也至少 organic）
  const pending = captureAcquisitionFromLocation();
  try {
    const res = await fetch(`${API_BASE}/analytics/acquisition`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
        ...(getDeviceId() ? { 'X-Device-Id': getDeviceId() } : {}),
      },
      body: JSON.stringify(pending),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { ok?: boolean; existing?: boolean; bound?: boolean };
    if (data.ok) {
      markBoundLocally(code);
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

/** 生成带 ch1/ch2/ch3 的追踪链接 */
export function buildTrackedUrl(
  pathOrUrl: string,
  opts: { l1: ChannelL1; l2: string; l3?: string; absolute?: boolean },
): string {
  const absolute = opts.absolute !== false && typeof window !== 'undefined';
  let u: URL;
  try {
    u = absolute
      ? new URL(pathOrUrl, window.location.origin)
      : new URL(pathOrUrl, 'https://local.invalid');
  } catch {
    return pathOrUrl;
  }
  u.searchParams.set('ch1', opts.l1);
  u.searchParams.set('ch2', slug(opts.l2, 64) || 'direct');
  if (opts.l3) u.searchParams.set('ch3', slug(opts.l3, 128));
  if (!absolute) {
    return `${u.pathname}${u.search}${u.hash}`;
  }
  return u.toString();
}

export function dailyVerseShareUrl(day: number, sharerUserCode?: string): string {
  const l3 = sharerUserCode
    ? `dv:${day}.u:${slug(sharerUserCode, 32)}`
    : `dv:${day}`;
  return buildTrackedUrl('/', {
    l1: 'share',
    l2: 'system_share',
    l3,
  });
}

export function groupJoinTrackedUrl(joinCode: string, groupId?: string): string {
  const code = (joinCode || '').trim().toUpperCase();
  const path = `/discover/join?code=${encodeURIComponent(code)}`;
  return buildTrackedUrl(path, {
    l1: 'social',
    l2: 'group_invite',
    l3: groupId ? `group:${slug(groupId, 64)}` : `join:${slug(code, 64)}`,
  });
}
