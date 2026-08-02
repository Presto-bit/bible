/** API 核心：身份、鉴权头、HTTP 助手（供域模块窄依赖）。 */
// 后端 API 基址（与移动端共用同一 FastAPI）。
import { chinaTodayYmd } from './daily_clock';
import { detectClientKind } from './client_kind';
import {
  bindDeviceGuestId,
  clearDeviceGuestBinding,
  getDeviceBoundGuestId,
  getDeviceId,
  markIdentityBootstrapped,
  resetInstallIdentity,
  resolveDeviceId,
  stableDeviceFingerprint,
} from './device_id';
import { deviceIdToUserCode, isUserCode, USER_CODE_RE } from './user_code';
import { userLsGet, userLsSet, userLsRemove } from './user_storage';
import { clearCachedHomeCampaigns } from './home_campaigns_cache';

export { getDeviceId, stableDeviceFingerprint } from './device_id';
export { deviceIdToUserCode, isUserCode, USER_CODE_LEN, USER_CODE_RE } from './user_code';
export { fetchAiQuota, type AiQuota } from './api/ai';

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || 'https://2sc.prestoai.cn';

/** 同源时用相对路径加载 /content 静态资源（图鉴 SVG 等），避免跨域或错误 API 基址。 */
export function contentAssetUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  if (typeof window !== 'undefined') {
    try {
      if (new URL(API_BASE).origin === window.location.origin) {
        const bp = process.env.NEXT_PUBLIC_BASE_PATH || '';
        return `${bp}${p}`;
      }
    } catch {
      /* ignore */
    }
  }
  return `${API_BASE}${p}`;
}

export interface BibleBook {
  id: string;
  name: string;
  testament: string;
  chapter_count: number;
}

export interface Verse {
  verse: number;
  text: string;
}

export type DailyVerseTone = 'strength' | 'faith' | 'encourage' | 'depth' | string;
export type DailyVerseArc = 'stand' | 'go' | 'trust' | 'lift' | 'depth' | string;

export interface DailyVerse {
  ref: string;
  theme: string;
  text: string;
  day?: number;
  book?: string;
  chapter?: number;
  verse_start?: number;
  verse_end?: number;
  /** strength | faith | encourage | depth */
  tone?: DailyVerseTone;
  /** stand | go | trust | lift | depth */
  arc?: DailyVerseArc;
  /** 一行导语（首页副文案） */
  line?: string;
  likes_count?: number;
  liked?: boolean;
  shares_count?: number;
  reacts_count?: number;
  my_react?: DailyVerseReactPreset | null;
  top_presets?: DailyVerseReactTopPreset[];
}

export interface DailyVerseReactPreset {
  id: string;
  kind: 'emoji' | 'phrase' | string;
  emoji: string;
  label: string;
}

export interface DailyVerseReactTopPreset extends DailyVerseReactPreset {
  count: number;
}

export interface DailyVerseReactFeedItem {
  user_code: string;
  display_name: string;
  preset: DailyVerseReactPreset;
  created_at: string;
}

export interface DailyVerseReactFeed {
  day: number;
  items: DailyVerseReactFeedItem[];
  reacts_count: number;
  my_react: DailyVerseReactPreset | null;
  top_presets: DailyVerseReactTopPreset[];
  emojis: DailyVerseReactPreset[];
  phrases: DailyVerseReactPreset[];
}

export interface DailyVerseReactResult {
  reacts_count: number;
  my_react: DailyVerseReactPreset | null;
  top_presets: DailyVerseReactTopPreset[];
  removed: boolean;
}

export interface HeroBCampaignPublic {
  id: string;
  imageUrl: string;
  imageUrlDark?: string | null;
  alt: string;
  href: string;
  badge?: string | null;
}

export interface HomeBootstrap {
  dailyVerse: DailyVerse;
  heroBCampaign: HeroBCampaignPublic | null;
  /** 今日推荐运营卡（与 /content/campaigns/home 同形，可缺省兼容旧后端） */
  railCampaigns?: Array<{
    id: string;
    name: string;
    tag?: string;
    subtitle?: string;
    href?: string;
    coverUrl?: string | null;
  }>;
}

export interface DailyDevotional {
  day?: number;
  verse: { ref: string; text: string; theme: string };
  meditation: string;
  prayer: string;
}

export interface PrayerToday {
  plan_id: string;
  plan_title?: string;
  model?: string;
  day: number;
  title: string;
  scripture: { ref?: string; text?: string };
  acts: {
    adoration?: string;
    confession?: string;
    thanksgiving?: string;
    supplication?: string;
  };
  prompt?: string;
}

export async function getJson<T>(
  path: string,
  headers?: Record<string, string>,
  opts?: { timeoutMs?: number },
): Promise<T> {
  // 默认带上设备/用户身份头，供服务端每日 UV 计数（否则 /bible、/content 会漏计）
  const timeoutMs = opts?.timeoutMs ?? 12_000;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      cache: 'no-store',
      headers: { ...authHeaders(), ...headers },
      signal: ac.signal,
    });
    if (!res.ok) {
      let detail = `请求失败 ${res.status}`;
      try {
        const d = (await res.json()) as { detail?: unknown; error?: string };
        if (typeof d.detail === 'string' && d.detail.trim()) detail = d.detail;
        else if (typeof d.error === 'string' && d.error.trim()) detail = d.error;
      } catch {
        detail = `${detail}: ${path}`;
      }
      throw new Error(detail);
    }
    return res.json() as Promise<T>;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error(`请求超时: ${path}`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function userCodeHeader(): Record<string, string> {
  const code = effectiveId();
  return code ? { 'X-User-Code': code } : {};
}

// ── 身份（本地优先：免注册 8 位数字 ID 即唯一标识；兼容历史 10 位） ──
const GUEST_KEY = 'presto_guest_id';
const USER_KEY = 'presto_user_id';
const SESSION_KEY = 'presto_session_token';
const NAME_KEY = 'profile_name';
const HAS_PWD_KEY = 'account_has_password';
const ONBOARDED_KEY = 'account_onboarded';
const PHONE_KEY = 'account_phone';
/** 手机号所属 user_code，换账号时避免沿用上一账号的号码 */
const PHONE_OWNER_KEY = 'account_phone_owner';
// 本地用户名 → user_code 映射（不含密码，仅离线查 ID）
const REGISTRY_KEY = 'account_registry';

const FIRST_SEEN_KEY = 'presto_first_seen';

let ensureAccountPromise: Promise<void> | null = null;

function ensureFirstSeen() {
  if (!localStorage.getItem(FIRST_SEEN_KEY)) {
    localStorage.setItem(FIRST_SEEN_KEY, String(Date.now()));
  }
}

function setHasPasswordCached(v: boolean) {
  localStorage.setItem(HAS_PWD_KEY, v ? '1' : '0');
}

export function hasPassword(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(HAS_PWD_KEY) === '1';
}

/** 按当前账号同步手机号；服务端无绑定则清除本地，避免显示上一账号号码 */
function applyAccountPhone(phone: string | null | undefined, ownerCode: string) {
  if (!isUserCode(ownerCode)) return;
  const prevOwner = localStorage.getItem(PHONE_OWNER_KEY);
  if (prevOwner && prevOwner !== ownerCode) {
    localStorage.removeItem(PHONE_KEY);
  }
  localStorage.setItem(PHONE_OWNER_KEY, ownerCode);
  const p = typeof phone === 'string' ? phone.trim() : '';
  if (p) localStorage.setItem(PHONE_KEY, p);
  else localStorage.removeItem(PHONE_KEY);
}

async function refreshAccountStatus(_code?: string): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/auth/account-status`, {
      cache: 'no-store',
      headers: authHeaders(),
    });
    if (!res.ok) return;
    const d = await res.json();
    const code = (d.user_code as string) || effectiveId() || '';
    if (d.username && code) userLsSet(NAME_KEY, d.username, code);
    if (code) applyAccountPhone(d.phone ?? null, code);
    if (d.has_password) setHasPasswordCached(true);
    else if (!userLsGet(NAME_KEY, code)?.trim()) setHasPasswordCached(false);
    // 服务端已有用户名+密码时，视为引导完成
    if (d.username && d.has_password) markOnboarded();
  } catch {
    /* 离线跳过 */
  }
}

export function getSessionToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(SESSION_KEY);
}

export function setSessionToken(token: string | null | undefined): void {
  if (typeof window === 'undefined') return;
  const t = (token || '').trim();
  if (t) localStorage.setItem(SESSION_KEY, t);
}

function clearSessionToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(SESSION_KEY);
}

function deviceHeaders(): Record<string, string> {
  // 与 authHeaders 对齐：凡带设备头的请求一并带上用户码，避免 UV 记成「游客设备」
  return authHeaders();
}

function hasSecuredLocalSession(): boolean {
  return (
    localStorage.getItem(HAS_PWD_KEY) === '1' &&
    Boolean(currentUserId() || localStorage.getItem(GUEST_KEY))
  );
}

/** 已设密登录态下，禁止用设备上的旧游客绑定覆盖当前账号 */
function applyServerUserCode(code: string, opts?: { forceUser?: boolean }): void {
  if (!isUserCode(code)) return;
  const securedUid = hasSecuredLocalSession() ? currentUserId() : null;
  if (securedUid && code !== securedUid && !opts?.forceUser) {
    // 保持 GUEST 与已登录 USER 对齐，避免后续 register 写错 profile 桶
    if (localStorage.getItem(GUEST_KEY) !== securedUid) {
      localStorage.setItem(GUEST_KEY, securedUid);
      bindDeviceGuestId(securedUid);
    }
    return;
  }
  localStorage.setItem(GUEST_KEY, code);
  bindDeviceGuestId(code);
  if (opts?.forceUser || !currentUserId()) localStorage.setItem(USER_KEY, code);
}

/** 登录/设密成功后：GUEST 与 USER 必须与服务端 user_code 对齐 */
function adoptAuthenticatedUserCode(code: string): void {
  if (!isUserCode(code)) return;
  bumpIdentityEpoch();
  localStorage.setItem(GUEST_KEY, code);
  bindDeviceGuestId(code);
  localStorage.setItem(USER_KEY, code);
}

let ensureIdentityPromise: Promise<void> | null = null;
/** 递增后丢弃 in-flight 的 identity/account ensure，避免登录后被旧游客回调覆盖 */
let identityEpoch = 0;

function bumpIdentityEpoch() {
  identityEpoch += 1;
}

/** 登录/换号后清空，避免沿用游客建档期的 ensure 缓存 */
export function resetAccountEnsureCaches() {
  bumpIdentityEpoch();
  ensureAccountPromise = null;
  ensureIdentityPromise = null;
}

/** 丢弃本地账号缓存（保留安装级 device_id），用于服务端已解绑时自动换新 ID */
function clearLocalAccountIdentity() {
  localStorage.removeItem(GUEST_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(PHONE_KEY);
  localStorage.removeItem(PHONE_OWNER_KEY);
  userLsRemove(NAME_KEY);
  localStorage.removeItem(HAS_PWD_KEY);
  localStorage.removeItem(ONBOARDED_KEY);
  clearSessionToken();
  clearDeviceGuestBinding();
}

/** 启动时：解析 device_id → 以服务端设备绑定为准分配 user_code */
export async function ensureIdentityReady(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (ensureIdentityPromise) return ensureIdentityPromise;
  const epochAtStart = identityEpoch;
  ensureIdentityPromise = (async () => {
    await resolveDeviceId();
    if (epochAtStart !== identityEpoch) return;
    const deviceId = getDeviceId();

    // 在线：服务端绑定优先；未绑定则自动换新账号（清库/撞号后两台设备无需手动点）
    if (deviceId && !deviceId.startsWith('dev-')) {
      try {
        // 本机已是密码账号：不要被设备上的游客绑定覆盖（登录抢绑前的竞态窗口）
        if (hasSecuredLocalSession() && getSessionToken()) {
          const localCode = currentUserId() || localStorage.getItem(GUEST_KEY);
          if (localCode && isUserCode(localCode)) {
            // 强制 GUEST≡USER，防止登录后仍残留旧游客码
            const uid = currentUserId();
            if (uid && localStorage.getItem(GUEST_KEY) !== uid) {
              localStorage.setItem(GUEST_KEY, uid);
            }
            bindDeviceGuestId(localCode);
            ensureFirstSeen();
            markIdentityBootstrapped();
            return;
          }
        }
        const params = new URLSearchParams({ device_id: deviceId });
        const res = await fetch(`${API_BASE}/auth/device-user?${params}`, {
          cache: 'no-store',
          headers: authHeaders(),
        });
        if (epochAtStart !== identityEpoch) return;
        if (res.ok) {
          const d = (await res.json()) as {
            user_code?: string | null;
            session_token?: string | null;
          };
          if (d.session_token) setSessionToken(d.session_token);
          if (d.user_code && isUserCode(d.user_code)) {
            applyServerUserCode(d.user_code);
            ensureFirstSeen();
            markIdentityBootstrapped();
            return;
          }
          // 服务端未绑定：若本地已设好用户名+密码，保留并稍后 register 重新绑定（避免反复清空又提示设置）
          const local = localStorage.getItem(GUEST_KEY);
          if (local && isUserCode(local) && userLsGet(NAME_KEY, local)?.trim()
            && localStorage.getItem(HAS_PWD_KEY) === '1') {
            bindDeviceGuestId(local);
            ensureFirstSeen();
            markIdentityBootstrapped();
            return;
          }
          // 本地也无完整账号 → 按 device_id 生成新 ID（清库/撞号后自动换号）
          if (epochAtStart !== identityEpoch) return;
          clearLocalAccountIdentity();
          const fresh = deviceIdToUserCode(deviceId);
          localStorage.setItem(GUEST_KEY, fresh);
          localStorage.setItem(USER_KEY, fresh);
          bindDeviceGuestId(fresh);
          ensureFirstSeen();
          markIdentityBootstrapped();
          return;
        }
      } catch {
        /* 离线：沿用本地 */
      }
    }

    if (epochAtStart !== identityEpoch) return;

    let g = localStorage.getItem(GUEST_KEY);
    if (g && isUserCode(g)) {
      bindDeviceGuestId(g);
      markIdentityBootstrapped();
      return;
    }

    const bound = getDeviceBoundGuestId();
    if (bound) {
      localStorage.setItem(GUEST_KEY, bound);
      ensureFirstSeen();
      markIdentityBootstrapped();
      return;
    }

    g = deviceIdToUserCode(deviceId);
    localStorage.setItem(GUEST_KEY, g);
    bindDeviceGuestId(g);
    ensureFirstSeen();
    markIdentityBootstrapped();
  })().finally(() => {
    // 仅清理本轮 promise，避免顶掉登录后重新拉起的 ensure
    if (ensureIdentityPromise && epochAtStart === identityEpoch) {
      /* keep resolved promise for dedupe until reset */
    }
  });
  return ensureIdentityPromise;
}

if (typeof window !== 'undefined') {
  void ensureIdentityReady();
}

/** 首次打开静默建档，写入登录态并 merge-guest（P0/P2） */
export async function ensureAccountReady(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (ensureAccountPromise) return ensureAccountPromise;
  const epochAtStart = identityEpoch;
  ensureAccountPromise = (async () => {
    await ensureIdentityReady();
    if (epochAtStart !== identityEpoch) return;
    // 落地归因：身份就绪后立刻 First Touch 采参（先于建档）
    void import('./acquisition')
      .then((m) => m.captureAcquisitionFromLocation())
      .catch(() => {});
    // 已登录优先用 USER，避免 GUEST 残留旧游客码导致 register 写错 profile 桶
    const code = currentUserId() || guestId();
    if (!code) return;
    const loggedIn = currentUserId();
    if (!loggedIn) localStorage.setItem(USER_KEY, code);
    else if (localStorage.getItem(GUEST_KEY) !== loggedIn) {
      localStorage.setItem(GUEST_KEY, loggedIn);
      bindDeviceGuestId(loggedIn);
    }
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...deviceHeaders(),
        },
        body: JSON.stringify({ user_code: code }),
      });
      if (epochAtStart !== identityEpoch) return;
      if (res.ok) {
        const d = await res.json();
        if (d.session_token) setSessionToken(d.session_token);
        // 已登录会话：勿被 register 回包里的其它 user_code 覆盖
        if (d.user_code && isUserCode(d.user_code) && !currentUserId()) {
          applyServerUserCode(d.user_code);
        }
        const nameOwner = currentUserId() || code;
        if (d.username) userLsSet(NAME_KEY, d.username, nameOwner);
        // 勿用「无密码」覆盖本地已确认的设密状态（避免 register 回包异常导致反复引导）
        if (d.has_password) setHasPasswordCached(true);
        else if (localStorage.getItem(HAS_PWD_KEY) !== '1') setHasPasswordCached(false);
      }
    } catch {
      /* 离线：本地 ID 仍可用 */
    }
    if (epochAtStart !== identityEpoch) return;
    const finalCode = currentUserId() || guestId() || code;
    await refreshAccountStatus(finalCode);
    void import('./post_login').then((m) => m.mergeGuest()).catch(() => {});
    // 建档有会话后绑定获客渠道（服务端幂等 First Touch）
    void import('./acquisition')
      .then((m) => m.bindPendingAcquisition())
      .catch(() => {});
  })();
  return ensureAccountPromise;
}

/** 游客 ID：须先 await ensureIdentityReady；同步调用时仅读已恢复值 */
export function guestId(): string {
  if (typeof window === 'undefined') return '';
  let g = localStorage.getItem(GUEST_KEY);
  if (g && isUserCode(g)) {
    bindDeviceGuestId(g);
    return g;
  }
  const bound = getDeviceBoundGuestId();
  if (bound) {
    localStorage.setItem(GUEST_KEY, bound);
    ensureFirstSeen();
    return bound;
  }
  const deviceId = getDeviceId();
  if (!deviceId) return '';
  g = deviceIdToUserCode(deviceId);
  return g;
}

/** 异步恢复：localStorage 无 ID 时从 IndexedDB / 服务端恢复 */
export async function guestIdAsync(): Promise<string> {
  if (typeof window === 'undefined') return '';
  await ensureIdentityReady();
  const cur = localStorage.getItem(GUEST_KEY);
  if (cur && isUserCode(cur)) return cur;
  return guestId();
}

// 注册（首次使用）年份；用于读经回顾「注册年→当年」范围。
export function registrationYear(): number {
  if (typeof window === 'undefined') return new Date().getFullYear();
  const raw = localStorage.getItem(FIRST_SEEN_KEY);
  const ts = raw ? Number(raw) : NaN;
  if (Number.isFinite(ts) && ts > 0) return new Date(ts).getFullYear();
  return new Date().getFullYear();
}

// 当前登录用户 ID（须为 8/10 位数字；非法值如 u_* 会被清除）。
export function currentUserId(): string | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  if (!isUserCode(raw)) {
    localStorage.removeItem(USER_KEY);
    return null;
  }
  return raw;
}

// 对外统一的「我的用户ID」（始终为有效 8/10 位：登录 ID 或游客 ID）。
export function effectiveId(): string {
  return currentUserId() || guestId();
}

interface RegistryEntry {
  id: string;
}
function readRegistry(): Record<string, RegistryEntry> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = JSON.parse(localStorage.getItem(REGISTRY_KEY) || '{}') as Record<string, RegistryEntry | { id: string; pwd?: string }>;
    const out: Record<string, RegistryEntry> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (v && typeof v.id === 'string') out[k] = { id: v.id };
    }
    return out;
  } catch {
    return {};
  }
}
function writeRegistry(r: Record<string, RegistryEntry>) {
  localStorage.setItem(REGISTRY_KEY, JSON.stringify(r));
}

export function getUserName(): string {
  if (typeof window === 'undefined') return '';
  return userLsGet(NAME_KEY) || '';
}

function applyLocalUsername(name: string, code?: string) {
  const u = name.trim();
  if (!u) return;
  const id = code || effectiveId();
  userLsSet(NAME_KEY, u, id || undefined);
  if (!id) return;
  const reg = readRegistry();
  for (const key of Object.keys(reg)) {
    if (reg[key].id === id) delete reg[key];
  }
  reg[u] = { id };
  writeRegistry(reg);
}

async function readApiError(res: Response, fallback: string): Promise<string> {
  try {
    const d = await res.json();
    if (typeof d.detail === 'string' && d.detail.trim()) return d.detail;
    if (Array.isArray(d.detail) && d.detail[0]?.msg) return String(d.detail[0].msg);
  } catch {
    /* ignore */
  }
  return fallback;
}

/** 登录后改展示称呼。成功后写本地 profile_name。 */
export async function changeUsername(username: string): Promise<string> {
  const u = username.trim();
  if (u.length < 2) throw new Error('称呼至少 2 个字');
  await ensureAccountReady();
  const id = effectiveId();
  if (!id) throw new Error('账号未就绪');
  const res = await fetch(`${API_BASE}/auth/change-username`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ user_code: id, username: u, random: false }),
  });
  if (res.status === 401) throw new Error('请先完成账号初始化');
  if (res.status === 409) throw new Error('该称呼已被占用');
  if (!res.ok) throw new Error(await readApiError(res, '改名失败'));
  const d = (await res.json()) as { username?: string };
  const next = (d.username || u).trim();
  applyLocalUsername(next, id);
  return next;
}

/** 「换一个」：服务端重新分配系统随机名。 */
export async function reshuffleUsername(): Promise<string> {
  await ensureAccountReady();
  const id = effectiveId();
  if (!id) throw new Error('账号未就绪');
  const res = await fetch(`${API_BASE}/auth/change-username`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ user_code: id, username: null, random: true }),
  });
  if (res.status === 401) throw new Error('请先完成账号初始化');
  if (!res.ok) throw new Error(await readApiError(res, '换名失败'));
  const d = (await res.json()) as { username?: string };
  const next = (d.username || '').trim();
  if (!next) throw new Error('换名失败');
  applyLocalUsername(next, id);
  return next;
}

export function getBoundPhone(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(PHONE_KEY) || '';
}

export interface BoundDevice {
  id: string;
  label: string;
  updated_at?: string | null;
}

export async function bindPhone(phone: string, password?: string | null): Promise<string> {
  const res = await fetch(`${API_BASE}/auth/bind-phone`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...deviceHeaders(), ...authHeaders() },
    body: JSON.stringify({ phone, password: password || null }),
  });
  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      detail = (await res.json()).detail || detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  const d = await res.json();
  const owner = (d.user_code as string) || guestId() || currentUserId() || '';
  applyAccountPhone(d.phone ?? null, owner);
  return (d.phone as string) || '';
}

export async function listDevices(): Promise<BoundDevice[]> {
  const res = await fetch(`${API_BASE}/auth/devices`, {
    headers: authHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) return [];
  const d = await res.json();
  return Array.isArray(d.devices) ? (d.devices as BoundDevice[]) : [];
}

export async function unbindDevice(deviceId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/auth/devices/${encodeURIComponent(deviceId)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('解绑失败');
}

/** 全 App 统一显示名：自设昵称 → 中性占位（不再用「用户xxxx」冒充身份） */
export function getDisplayName(): string {
  const name = getUserName().trim();
  if (name) return name;
  return '读经伙伴';
}

export function isOnboarded(): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem(ONBOARDED_KEY) === '1';
}
export function markOnboarded() {
  if (typeof window !== 'undefined') localStorage.setItem(ONBOARDED_KEY, '1');
}

// 用户名是否可用（不重复）。后端可用时以服务端为准，否则用本地注册表。
export async function usernameAvailable(username: string): Promise<boolean> {
  const u = username.trim();
  if (!u) return false;
  const reg = readRegistry();
  const localTaken = Object.prototype.hasOwnProperty.call(reg, u) && reg[u].id !== effectiveId();
  try {
    const res = await fetch(
      `${API_BASE}/auth/username-available?u=${encodeURIComponent(u)}`,
      { cache: 'no-store' },
    );
    if (res.ok) {
      const d = await res.json();
      return Boolean(d.available) && !localTaken;
    }
  } catch {
    /* 后端不可用：仅用本地校验 */
  }
  return !localTaken;
}

// 设置名称 + 密码（首次引导 / 设密）。已设密后的纯改名请用 changeUsername。
export async function setCredentials(username: string, password: string): Promise<void> {
  const u = username.trim();
  const id = effectiveId();
  markOnboarded();
  localStorage.setItem(USER_KEY, id);
  try {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...deviceHeaders() },
      body: JSON.stringify({
        user_code: id,
        username: u || null,
        password: password || null,
      }),
    });
    if (res.ok) {
      const d = await res.json();
      if (d.session_token) setSessionToken(d.session_token);
      const serverCode = d.user_code && isUserCode(d.user_code) ? (d.user_code as string) : id;
      adoptAuthenticatedUserCode(serverCode);
      const finalName = ((d.username as string | undefined) || u || '').trim();
      if (finalName) applyLocalUsername(finalName, serverCode);
      // 本次提交了密码则本地直接记为已设密，避免回包缺字段导致引导不消失
      if (password.length >= 6 || d.has_password) setHasPasswordCached(true);
      else setHasPasswordCached(Boolean(d.has_password));
      await refreshAccountStatus(serverCode);
    } else {
      // 已设密改名等失败必须抛出，禁止「本地已改、云端未改」的假成功
      throw new Error(await readApiError(res, '保存失败，请检查网络'));
    }
  } catch (e) {
    throw e instanceof Error ? e : new Error(String(e));
  }
  resetAccountEnsureCaches();
  await import('./post_login').then((m) => m.afterLogin());
}

export async function changePassword(oldPassword: string | null, newPassword: string): Promise<void> {
  const id = effectiveId();
  if (newPassword.length < 6) throw new Error('密码至少 6 位');
  const res = await fetch(`${API_BASE}/auth/change-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify({
      user_code: id,
      old_password: oldPassword || null,
      new_password: newPassword,
    }),
  });
  if (res.status === 401) throw new Error('当前密码不正确');
  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      detail = (await res.json()).detail || detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  try {
    const d = (await res.json()) as { session_token?: string };
    if (d.session_token) setSessionToken(d.session_token);
  } catch {
    /* ignore */
  }
  setHasPasswordCached(true);
}

// 登录：标识符可为 8/10 位用户ID，或用户名（需配密码）。必须经服务端校验。
export async function loginWithIdentifier(identifier: string, password: string): Promise<string> {
  const idf = identifier.trim();
  if (!idf) throw new Error('请输入手机号、用户 ID 或用户名');

  if (!/^\d{8}$/.test(idf) && !/^\d{10}$/.test(idf) && !password) {
    throw new Error('登录需要密码');
  }

  // 确保有 device_id，登录才能抢绑本机，刷新后不会回到旧游客
  await resolveDeviceId();

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...deviceHeaders() },
      body: JSON.stringify({ identifier: idf, password: password || null }),
    });
  } catch {
    throw new Error('网络异常，请稍后重试');
  }

  if (res.status === 401) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.detail || '账号或密码错误');
  }
  if (!res.ok) {
    throw new Error('登录失败，请稍后重试');
  }

  const d = await res.json();
  const code = d.user_code as string;
  if (d.session_token) setSessionToken(d.session_token);
  adoptAuthenticatedUserCode(code);
  if (d.username) userLsSet(NAME_KEY, d.username, code);
  applyAccountPhone(d.phone ?? null, code);
  // 用密码登录成功即视为已设密（避免回包缺字段导致刷新退回旧游客）
  if (password || d.has_password) setHasPasswordCached(true);
  else setHasPasswordCached(Boolean(d.has_password));
  markOnboarded();
  // 必须等全量拉取完成再返回，否则登录页会提前显示「已恢复」而读经仍为空
  resetAccountEnsureCaches();
  await import('./post_login').then((m) => m.afterLogin());
  await refreshAccountStatus(code);
  return code;
}

export function logout() {
  if (typeof window === 'undefined') return;
  const tok = getSessionToken();
  if (tok) {
    void fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}` },
    }).catch(() => {});
  }
  clearLocalAccountIdentity();
  resetAccountEnsureCaches();
  clearCachedHomeCampaigns();
  void ensureIdentityReady().then(() => ensureAccountReady());
}

/**
 * 本机误绑他人账号时：清除身份并刷新，生成新的用户 ID。
 * （同型号手机曾因硬件指纹撞号共用一个账号。）
 */
export async function startFreshAccount(): Promise<void> {
  resetAccountEnsureCaches();
  await resetInstallIdentity();
  await ensureIdentityReady();
  await ensureAccountReady();
}

export interface Citation {
  n: number;
  title: string;
  score: number;
  snippet?: string;
  document_id?: string | null;
}

export interface KnowledgeBaseFolder {
  id: string;
  name: string;
  description: string;
  kind?: string;
  document_count: number;
  updated_at?: string | null;
  documents?: {
    id: string;
    title: string;
    source_type: string;
    status: string;
    created_at?: string | null;
  }[];
}

export interface KnowledgeBaseSummary {
  id: string;
  name: string;
  description: string;
  is_default: boolean;
  kind: string;
  document_count?: number;
  updated_at?: string | null;
}

export interface KnowledgeBaseBrowsePlatform {
  id: string;
  name: string;
  description: string;
  folders: KnowledgeBaseFolder[];
  document_count: number;
}

export interface KnowledgeBaseDetail extends KnowledgeBaseSummary {
  folders?: KnowledgeBaseFolder[];
  documents: {
    id: string;
    title: string;
    source_type: string;
    status: string;
    created_at?: string | null;
    source_path?: string | null;
  }[];
  document_count: number;
  updated_at?: string | null;
  has_subfolders?: boolean;
  group?: string | null;
  group_label?: string | null;
}

export interface KnowledgeDocumentPreview {
  id: string;
  title: string;
  source_type?: string;
  source_path?: string | null;
  status?: string;
  /** 源文件原文（Markdown / 纯文本） */
  content: string;
  truncated?: boolean;
  size_bytes?: number | null;
}

export interface CitationExplainResult {
  title: string;
  explain_zh: string;
  snippet: string;
  disclaimer: string;
  cached?: boolean;
  error?: string;
  skipped?: boolean;
  source_lang?: string;
  snippet_hash?: string;
}

export async function listKnowledgeBases(): Promise<KnowledgeBaseSummary[]> {
  const data = await getJson<{ items: KnowledgeBaseSummary[] }>('/ai/knowledge-bases');
  return data.items ?? [];
}

export async function browseKnowledgeBases(): Promise<{
  items: KnowledgeBaseSummary[];
  platform: KnowledgeBaseBrowsePlatform;
}> {
  return getJson('/ai/knowledge-bases');
}

export async function getKnowledgeBase(
  id: string,
  opts?: { group?: string | null },
): Promise<KnowledgeBaseDetail> {
  const q = new URLSearchParams();
  if (opts?.group) q.set('group', opts.group);
  const suffix = q.toString() ? `?${q}` : '';
  return getJson<KnowledgeBaseDetail>(
    `/ai/knowledge-bases/${encodeURIComponent(id)}${suffix}`,
  );
}

export async function previewKnowledgeDocument(
  documentId: string,
): Promise<KnowledgeDocumentPreview> {
  return getJson<KnowledgeDocumentPreview>(
    `/ai/knowledge-bases/documents/${encodeURIComponent(documentId)}`,
  );
}

export async function explainCitation(body: {
  title?: string;
  snippet: string;
  force?: boolean;
}): Promise<CitationExplainResult> {
  const res = await fetch(`${API_BASE}/ai/citations/explain`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`请求失败 ${res.status}`);
  return res.json() as Promise<CitationExplainResult>;
}

export type AnalysisShareSnapshot = {
  id: string;
  ref_label: string;
  ref_param: string;
  lead: string;
  answer_markdown: string;
  citations: Citation[];
  created_at?: string | null;
  expires_at?: string | null;
};

export async function createAnalysisShareSnapshot(body: {
  ref_label?: string;
  ref_param?: string;
  answer_markdown: string;
  lead?: string;
  citations?: Citation[];
}): Promise<{ id: string; path: string; lead: string; ref_label: string }> {
  return authed('/ai/analysis-share', { method: 'POST', body });
}

export async function getAnalysisShareSnapshot(
  id: string,
): Promise<AnalysisShareSnapshot> {
  return getJson(`/ai/analysis-share/${encodeURIComponent(id)}`);
}

export interface ChatHistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** 客户端本地读者上下文，注入小爱 prompt（不落服务端） */
export interface ChatReaderContext {
  last_read_label?: string;
  reading_streak?: number;
  today_reading_minutes?: number;
  recent_note_snippets?: string[];
  active_plan_title?: string;
  /** 节级对照：注入可供比较的译本正文，避免 AI 杜撰措辞 */
  compare_versions?: { label: string; text: string; version?: string }[];
}

export interface ChatStreamBody {
  ref?: string | null;
  question: string;
  mode: string;
  scene?: string;
  history?: ChatHistoryTurn[];
  surface?: string;
  reader_context?: ChatReaderContext;
  knowledge_base_id?: string | null;
}

export interface ChatMetaPayload {
  citations: Citation[];
  scene?: string;
  scene_label?: string;
  mode?: string;
  mode_label?: string;
  display?: string;
  wants_followups?: boolean;
  use_rag?: boolean;
  has_commentary?: boolean;
  knowledge_base_id?: string;
  knowledge_base_name?: string;
  quota?: { used: number; limit: number };
  /** 答案缓存 / 预读命中 */
  cache_hit?: boolean;
  cache_source?: 'cache' | 'prewarm' | string;
  instant?: boolean;
}

export interface ChatDonePayload {
  length?: number;
  word_count?: number;
  followups?: string[];
  sections?: { id: string; title: string }[];
  cache_hit?: boolean;
  cache_source?: 'cache' | 'prewarm' | string;
  instant?: boolean;
}

export interface ChatCallbacks {
  onMeta?: (meta: ChatMetaPayload) => void;
  onDelta?: (text: string) => void;
  onFollowups?: (items: string[]) => void;
  onError?: (msg: string) => void;
  onDone?: (payload?: ChatDonePayload) => void;
}

// SSE over POST（浏览器 EventSource 不支持 POST，手动解析流）。
export async function chatStream(
  body: ChatStreamBody,
  cb: ChatCallbacks,
  opts?: { signal?: AbortSignal },
): Promise<void> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...authHeaders(),
  };

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/ai/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: opts?.signal,
    });
  } catch (e) {
    if (opts?.signal?.aborted) {
      cb.onError?.('请求超时，请重试或前往小爱 Tab 继续对话');
    } else {
      cb.onError?.('网络异常，请检查连接后重试');
    }
    return;
  }
  if (res.status === 429) {
    cb.onError?.(
      currentUserId()
        ? '今日 AI 使用已达上限，请明日再试'
        : '今日免费次数已用完，明日继续',
    );
    return;
  }
  if (!res.ok || !res.body) {
    let detail = `请求失败 ${res.status}`;
    try {
      const d = (await res.json()) as { detail?: unknown; error?: string };
      if (typeof d.detail === 'string' && d.detail.trim()) detail = d.detail;
      else if (typeof d.error === 'string' && d.error.trim()) detail = d.error;
    } catch {
      /* ignore */
    }
    cb.onError?.(detail);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let event = '';
  let gotDelta = false;

  const processLine = (line: string) => {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      const json = line.slice(5).trim();
      if (!json) return;
      try {
        const d = JSON.parse(json);
        if (event === 'meta') cb.onMeta?.(d);
        else if (event === 'delta') {
          gotDelta = true;
          cb.onDelta?.(d.text ?? '');
        } else if (event === 'followups') {
          const items = Array.isArray(d.items) ? (d.items as string[]) : [];
          if (items.length) cb.onFollowups?.(items);
        } else if (event === 'error') cb.onError?.(d.message ?? '出错了');
        else if (event === 'done') cb.onDone?.(d as ChatDonePayload);
      } catch {
        /* 跳过不完整片段 */
      }
    }
  };

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (value) buf += decoder.decode(value, { stream: true });
      if (done) buf += decoder.decode();

      const lines = buf.split('\n');
      buf = done ? '' : (lines.pop() ?? '');
      for (const line of lines) processLine(line);
      if (done) break;
    }
  } catch (e) {
    if (opts?.signal?.aborted) {
      cb.onError?.('请求超时，请重试或前往小爱 Tab 继续对话');
    } else if (!gotDelta) {
      cb.onError?.('连接中断，请重试');
    }
    return;
  }
  cb.onDone?.();
}

// ── 带认证头的请求（会话令牌 + 设备头；用户码头仅作兼容展示） ──
export function authHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  const device = getDeviceId();
  if (device) {
    h['X-Guest-Id'] = device;
    h['X-Device-Id'] = device;
  }
  const fp = stableDeviceFingerprint();
  if (fp) h['X-Device-Fingerprint'] = fp;
  const tok = getSessionToken();
  if (tok) h.Authorization = `Bearer ${tok}`;
  // 身份尚未写完 guest 时，用设备派生码兜底，避免 UV/限流只看到裸设备头
  let code = effectiveId();
  if (!code && device && !device.startsWith('dev-') && !device.startsWith('ip:')) {
    const derived = deviceIdToUserCode(device);
    if (isUserCode(derived)) code = derived;
  }
  if (code) {
    h['X-User-Code'] = code;
    h['X-User-Id'] = code;
  }
  if (typeof window !== 'undefined') {
    h['X-Client-Kind'] = detectClientKind();
  }
  return h;
}

export async function authed<T>(
  path: string,
  opts: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...opts.headers,
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: 'no-store',
  });
  if (res.status === 401) throw new Error('未登录');
  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      detail = (await res.json()).detail || detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

