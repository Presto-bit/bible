// 后端 API 基址（与移动端共用同一 FastAPI）。
import { chinaTodayYmd } from './daily_clock';
import { getAdminToken } from './admin_rag';
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

export interface DailyVerse {
  ref: string;
  theme: string;
  text: string;
  day?: number;
  book?: string;
  chapter?: number;
  verse_start?: number;
  verse_end?: number;
  likes_count?: number;
  liked?: boolean;
  shares_count?: number;
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

async function getJson<T>(path: string, headers?: Record<string, string>): Promise<T> {
  // 默认带上设备/用户身份头，供服务端每日 UV 计数（否则 /bible、/content 会漏计）
  const res = await fetch(`${API_BASE}${path}`, {
    cache: 'no-store',
    headers: { ...authHeaders(), ...headers },
  });
  if (!res.ok) throw new Error(`请求失败 ${res.status}: ${path}`);
  return res.json() as Promise<T>;
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

/** 全 App 统一显示名：资料昵称/用户名 → 游客后缀 → 读经伙伴 */
export function getDisplayName(): string {
  const name = getUserName().trim();
  if (name) return name;
  const g = guestId();
  if (g) return `用户${g.slice(-4)}`;
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

// 设置名称 + 密码（首次引导 / 修改）。密码仅存服务端 hash。
export async function setCredentials(username: string, password: string): Promise<void> {
  const u = username.trim();
  const id = effectiveId();
  if (u) {
    const reg = readRegistry();
    for (const key of Object.keys(reg)) {
      if (reg[key].id === id) delete reg[key];
    }
    reg[u] = { id };
    writeRegistry(reg);
    userLsSet(NAME_KEY, u);
    void import('./profile_sync').then((m) => m.pushProfileName(u));
  }
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
      if (u) {
        const reg = readRegistry();
        for (const key of Object.keys(reg)) {
          if (reg[key].id === id || reg[key].id === serverCode) delete reg[key];
        }
        reg[u] = { id: serverCode };
        writeRegistry(reg);
      }
      if (d.username) userLsSet(NAME_KEY, d.username);
      // 本次提交了密码则本地直接记为已设密，避免回包缺字段导致引导不消失
      if (password.length >= 6 || d.has_password) setHasPasswordCached(true);
      else setHasPasswordCached(Boolean(d.has_password));
      await refreshAccountStatus(serverCode);
    } else if (password) {
      throw new Error('保存失败，请检查网络');
    }
  } catch (e) {
    if (password) throw e instanceof Error ? e : new Error(String(e));
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
  if (!idf) throw new Error('请输入用户ID或用户名');

  if (!/^\d{8}$/.test(idf) && !/^\d{10}$/.test(idf) && !password) {
    throw new Error('用户名登录需要密码');
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
    throw new Error(d.detail || '用户名或密码错误');
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
}

export interface ChatDonePayload {
  length?: number;
  word_count?: number;
  followups?: string[];
  sections?: { id: string; title: string }[];
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
    cb.onError?.(`请求失败 ${res.status}`);
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
  return h;
}

async function authed<T>(
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

// ── 类型 ──
export interface Group {
  id: string;
  name: string;
  intro?: string | null;
  join_code: string;
  role: string;
  members: number;
  plan_id?: string | null;
  plan_title?: string | null;
  checked_in_today?: number;
  my_checked_in_today?: boolean;
  open_tasks?: number;
  plan_days_total?: number;
  plan_progress_pct?: number;
  plan_day_avg?: number;
  members_on_plan?: number;
  my_plan_day?: number;
}
export interface GroupTaskAttachment {
  id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  url: string;
  created_at?: string | null;
}

export interface GroupTask {
  id: string;
  title: string;
  ref?: string | null;
  due_at?: string | null;
  completed?: boolean;
  pinned?: boolean;
  task_type?: string;
  completion_rule?: string;
  body?: string | null;
  status?: string;
  publish_at?: string | null;
  series_id?: string | null;
  series_day?: number | null;
  template_id?: string | null;
  source?: string;
  plan_id?: string | null;
  plan_day?: number | null;
  assignee_ids?: string[];
  attachments?: GroupTaskAttachment[];
}
export interface GroupMember {
  user_id?: string;
  name: string;
  role: string;
  checked_in_today?: boolean;
  plan_day?: number;
  is_me?: boolean;
  avatar_id?: string | null;
}
export interface GroupDetail {
  id: string;
  name: string;
  intro?: string | null;
  join_code: string;
  role: string;
  members: GroupMember[];
  tasks: GroupTask[];
  plan_id?: string | null;
  plan_title?: string | null;
  announcement?: string | null;
  checked_in_today?: number;
  my_checked_in_today?: boolean;
  open_tasks?: number;
  plan_days_total?: number;
  plan_progress_pct?: number;
  plan_day_avg?: number;
  members_on_plan?: number;
  my_plan_day?: number;
  icebreaker_done?: boolean;
  pinned_task_id?: string | null;
  muted?: boolean;
  weekly_checkins?: number;
  weekly_active_days?: number;
  allow_chat?: boolean;
}
export interface GroupMessage {
  id: string;
  author: string;
  mine: boolean;
  user_id?: string;
  kind: string;
  ref?: string | null;
  body?: string | null;
  reactions: Record<string, string[]>;
  created_at: string;
  task_id?: string | null;
  task_due_at?: string | null;
  my_task_done?: boolean;
  recalled?: boolean;
  mentions?: string[];
  reply_to_id?: string | null;
  attachments?: Array<{
    id: string;
    file_name?: string | null;
    mime?: string | null;
    size_bytes?: number | null;
    storage_key?: string | null;
    url?: string | null;
  }>;
  /** 客户端乐观发送 */
  pending?: boolean;
  sendFailed?: boolean;
}
export interface DiscoverSummary {
  groups_pending_checkin: number;
  groups_pending_tasks: number;
  friends_checked_in_today: number;
  first_pending_group_id?: string | null;
}
export interface Friend {
  user_id: string;
  handle?: string | null;
  display_name?: string | null;
  avatar_id?: string | null;
  user_code?: string | null;
}
export interface ConversationItem {
  scope: 'group' | 'dm' | 'inbox_friends' | 'inbox_groups';
  ref_id: string;
  title: string;
  subtitle?: string | null;
  unread?: number;
  updated_at?: string | null;
  pinned?: boolean;
  muted?: boolean;
  badge?: string | null;
  role?: string;
  peer_user_id?: string;
  peer_avatar_id?: string | null;
}
export interface FriendRequestItem {
  id: string;
  from_user_id?: string;
  to_user_id?: string;
  message?: string | null;
  created_at?: string | null;
  handle?: string | null;
  display_name?: string | null;
  user_code?: string | null;
  status?: string | null;
}
export interface GroupInviteInboxItem {
  id: string;
  group_id: string;
  group_name: string;
  inviter_name: string;
  message: string;
  created_at?: string | null;
}
export interface PlanSummary {
  plan_id: string;
  title: string;
  type: string;
  days: number;
}

export interface DevotionalHomeCard {
  series_id: string;
  title: string;
  subtitle?: string;
  days_total: number;
  default_day: number;
  scheduled_day?: number;
  day: number;
  day_title?: string;
  last_tab?: string;
  participants_count: number;
  my_days: number;
  has_opened: boolean;
  href: string;
}

export interface OpsCampaignTemplate {
  id: string;
  name: string;
  domain: string;
  domainLabel?: string;
  tag: string;
  blurb: string;
  landing?: OpsCampaignLanding;
}

export interface OpsCampaignLanding {
  title?: string;
  body?: string;
  features?: {
    likes?: boolean;
    comments?: boolean;
    rsvp?: boolean;
    prayer?: boolean;
    prayerPrivate?: boolean;
    dayUnlock?: string;
    signup?: boolean;
    questions?: boolean;
    countdown?: boolean;
  };
  schedule?: {
    startsAt?: string;
    endsAt?: string;
    location?: string;
    onlineNote?: string;
  };
  days?: Array<{
    day: number;
    title?: string;
    body?: string;
    verseRef?: string;
    discussionHint?: string;
    locked?: boolean;
  }>;
  slots?: Array<{ id: string; title: string; limit: number }>;
  entries?: Array<{ id: string; title: string; sub?: string; href: string }>;
  primaryCta?: { label?: string; href?: string };
  /** 落地页积木顺序（编辑器用；内容仍在上述字段） */
  blocks?: Array<{ id: string; type: string }>;
}

export interface OpsCampaign {
  id: string;
  creatorId: string;
  name: string;
  templateId: string;
  status: string;
  startAt: string;
  endAt: string;
  coverUrl?: string | null;
  subtitle: string;
  railSlot: number;
  railEnabled: boolean;
  priority: number;
  landing: OpsCampaignLanding;
  groupIds: string[];
  tag?: string;
  stats?: OpsCampaignStats;
  createdAt?: string | null;
  updatedAt?: string | null;
  audienceMode?: 'groups' | 'all' | 'admin_preview';
  heroEnabled?: boolean;
  heroImageUrl?: string | null;
  heroImageUrlDark?: string | null;
  heroImageVersion?: number;
  heroAlt?: string;
  heroBadge?: string;
  heroHref?: string;
}

export interface OpsCampaignComment {
  id: string;
  day?: number | null;
  userId: string;
  body: string;
  createdAt?: string | null;
}

export interface OpsCampaignDetail extends OpsCampaign {
  isCreator?: boolean;
  liked?: boolean;
  likesCount?: number;
  myRsvp?: string | null;
  readDays?: number[];
  rsvpStats?: Record<string, number>;
  comments?: OpsCampaignComment[];
  prayers?: Array<{ id: string; userId: string; body: string; createdAt?: string | null }>;
  unlockedDayCap?: number;
  interactionClosed?: boolean;
  slots?: Array<{
    id: string;
    title: string;
    limit: number;
    taken: number;
    remaining?: number | null;
  }>;
  mySlots?: string[];
  questions?: Array<{
    id: string;
    userId: string;
    body: string;
    answer?: string | null;
    createdAt?: string | null;
    answeredAt?: string | null;
  }>;
}

export interface OpsCampaignStats {
  opens: number;
  readers: number;
  rsvps: number;
  likes: number;
  comments?: number;
  prayers?: number;
  signups?: number;
  questions?: number;
}

export interface OpsHomeCampaign {
  id: string;
  name: string;
  templateId: string;
  tag: string;
  subtitle: string;
  coverUrl?: string | null;
  railSlot: number;
  href: string;
  daysTotal: number;
  daysRead: number;
}

export interface OpsCampaignUpsert {
  id?: string;
  name: string;
  templateId: string;
  status: string;
  startAt: string;
  endAt: string;
  coverUrl?: string | null;
  subtitle?: string;
  railSlot?: number;
  railEnabled?: boolean;
  priority?: number;
  groupIds: string[];
  landing: OpsCampaignLanding;
  audienceMode?: 'groups' | 'all' | 'admin_preview';
  heroEnabled?: boolean;
  heroImageUrl?: string | null;
  heroImageUrlDark?: string | null;
  heroImageVersion?: number;
  heroAlt?: string;
  heroBadge?: string;
  heroHref?: string;
}

export interface DevotionalSessionSummary {
  day: number;
  title: string;
  chapter?: number;
  book?: string;
  book_name?: string;
  focus_verses?: string;
}

export interface DevotionalComment {
  id: string;
  user_id: string;
  body: string;
  created_at?: string | null;
  display_name: string;
  mine?: boolean;
}

export interface DevotionalCheckin {
  id: string;
  user_id?: string;
  emoji: string;
  body?: string | null;
  created_at?: string | null;
  display_name?: string;
  mine?: boolean;
  reactions?: Record<string, string[]>;
  comments?: DevotionalComment[];
}

export interface DevotionalDayDetail {
  series_id: string;
  series_title?: string;
  series_subtitle?: string;
  days_total: number;
  default_day?: number;
  scheduled_day?: number;
  day: number;
  title: string;
  book: string;
  book_name: string;
  chapter: number;
  focus_verses?: string;
  letter: { body: string; prayer: string; estimated_minutes?: number };
  workbook: {
    today_focus: string;
    ancient_question: string;
    ancient_hint: string;
    passage_summary: string;
    questions: { prompt: string; hint: string }[];
    covenant_thread: string;
    practices: string[];
    prayer: string;
    sc2_tags?: string | null;
    estimated_minutes?: number;
  };
  scripture: {
    book: string;
    chapter: number;
    version: string;
    focus_verses?: string;
    verses: Verse[];
  };
  participants_count: number;
  my_days: number;
  checked_days: number[];
  last_day: number;
  last_tab: string;
  today_checkins: number;
  day_checkins: number;
  has_opened: boolean;
  my_checkin?: DevotionalCheckin | null;
  sessions: DevotionalSessionSummary[];
  attribution?: string;
  copyright_note?: string;
}

export interface DevotionalSeriesDetail {
  series_id: string;
  title: string;
  subtitle?: string;
  theme?: string;
  days_total: number;
  default_day: number;
  sessions: DevotionalSessionSummary[];
  participants_count: number;
  my_days: number;
  checked_days: number[];
  last_day: number;
  last_tab: string;
  has_opened: boolean;
}

export interface GeneratedPlan {
  id: string;
  title: string;
  scope: string;
  days_count: number;
  chapters_total: number;
  days: { day: number; title: string; refs: string[]; date?: string }[];
  saved_at?: number;
  start_date?: string;
  end_date?: string;
  exclude_saturday?: boolean;
  exclude_sunday?: boolean;
}
export interface DictEntity {
  id?: string;
  name: string;
  type: string;
  summary: string;
  refs: string[];
  aliases?: string[];
  disambiguation?: string;
  testament?: 'OT' | 'NT' | 'BOTH';
  scope_books?: string[];
}
export interface CrossrefResult {
  ref?: string;
  label: string;
  related: { ref: string; text: string }[];
  count?: number;
}

export interface StrongsWord {
  position: number;
  word?: string;
  strongs?: string;
  lemma?: string;
  transliteration?: string;
  gloss?: string;
  morphology?: string;
}

export interface StrongsResult {
  ref?: string;
  book?: string;
  chapter?: number;
  verse?: number;
  words: StrongsWord[];
  entry?: {
    strongs: string;
    language: string;
    lemma?: string;
    transliteration?: string;
    gloss?: string;
  };
}

export interface TopicEntry {
  id: string;
  name: string;
  refs?: string[] | { ref: string; text: string }[];
  verse_count?: number;
}

export interface GeoPlace {
  id: string;
  name: string;
  type?: string;
  latitude: number;
  longitude: number;
  refs?: string[];
}

export interface TimelineChapter {
  book: string;
  chapter: number;
  year?: number;
  year_display?: string;
  era?: string;
  note?: string;
}

export interface MapTourStop {
  order: number;
  place_id: string;
  label: string;
  ref: string;
  note?: string;
  place?: GeoPlace | null;
}

export interface MapTour {
  id: string;
  title: string;
  subtitle?: string;
  era?: string;
  description?: string;
  /** traditional = 传统示意路线，非考古定论 */
  confidence?: 'traditional' | 'approximate';
  stops: MapTourStop[];
}

export interface TimelineTourEvent {
  order: number;
  book: string;
  chapter: number;
  verse?: number;
  ref?: string;
  year_display?: string;
  label: string;
  note?: string;
}

export interface TimelineTour {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  events: TimelineTourEvent[];
}

export interface BookSummary {
  book: string;
  name: string;
  testament: string;
  chapter_count: number;
  summary: string;
}

export interface ChapterSummary {
  book: string;
  chapter: number;
  summary: string;
}

export interface EntityRelation {
  from: string;
  to: string;
  type: string;
  label: string;
  refs?: string[];
  peer_id?: string;
  peer_name?: string;
  direction?: 'in' | 'out';
}

export interface EntityGraphNode {
  id: string;
  name: string;
  type: string;
}

export interface EntityGraph {
  center: DictEntity | null;
  edges: EntityRelation[];
  nodes: EntityGraphNode[];
}

export interface DiagramHotspot {
  id: string;
  label: string;
  x: number;
  y: number;
  ref?: string;
}

export interface BibleDiagram {
  id: string;
  title: string;
  category: string;
  file: string;
  entity_ids?: string[];
  refs?: string[];
  summary?: string;
  hotspots?: DiagramHotspot[];
}

export interface EntityKnowledge {
  entity: DictEntity;
  graph: EntityGraph;
  place: GeoPlace | null;
  map_tours: MapTour[];
  diagrams: BibleDiagram[];
}

export interface GraphTopic {
  id: string;
  title: string;
  subtitle?: string;
  entity_ids?: string[];
}

export interface BibleSearchHit {
  book: string;
  name: string;
  chapter: number;
  verse: number;
  text: string;
  ref: string;
  osis: string;
  version: string;
}

export interface BibleVersion {
  id: string;
  label: string;
  available: boolean;
  primary: boolean;
}

export interface VerseRendition {
  version: string;
  label: string;
  text: string;
}

export interface CompareResult {
  ref: string;
  osis: string;
  book: string;
  chapter: number;
  verse: number;
  versions: VerseRendition[];
}

export interface GuideCard {
  title: string;
  snippet: string;
  score: number;
}

export interface GuideResult {
  ok: boolean;
  ref: string;
  display: string;
  passage: string;
  cards: GuideCard[];
  knowledge_base_id?: string;
  knowledge_base_name?: string;
}

export const api = {
  homeBootstrap: (previewCampaignId?: string) => {
    const q = new URLSearchParams();
    q.set('_d', chinaTodayYmd());
    if (previewCampaignId) q.set('preview_campaign_id', previewCampaignId);
    const token = getAdminToken();
    const headers: Record<string, string> = { ...authHeaders() };
    if (token) headers.Authorization = `Bearer ${token}`;
    return getJson<HomeBootstrap>(`/content/home/bootstrap?${q}`, headers);
  },
  dailyVerse: (day?: number) => {
    const q = new URLSearchParams();
    if (day != null) q.set('day', String(day));
    else q.set('_d', chinaTodayYmd());
    return getJson<DailyVerse>(`/content/daily-verse?${q}`, authHeaders());
  },
  toggleDailyVerseLike: (day?: number) =>
    authed<{ liked: boolean; likes_count: number; shares_count: number }>(
      `/content/daily-verse/like${day != null ? `?day=${day}` : ''}`,
      { method: 'POST' },
    ),
  recordDailyVerseShare: (day?: number) =>
    authed<{ ok: boolean; likes_count: number; shares_count: number }>(
      `/content/daily-verse/share${day != null ? `?day=${day}` : ''}`,
      { method: 'POST' },
    ),
  dailyDevotional: () =>
    getJson<DailyDevotional>(`/content/daily-devotional?_d=${chinaTodayYmd()}`),
  /** 显式打点今日 UV（走 /content，避开未反代的 /analytics） */
  analyticsVisit: () =>
    authed<{ ok: boolean; day: string; error?: string | null }>('/content/uv-visit', {
      method: 'POST',
    }),
  prayerToday: (planId?: string, day?: number) => {
    const q = new URLSearchParams();
    if (planId) q.set('plan_id', planId);
    if (day != null) q.set('day', String(day));
    const qs = q.toString();
    return getJson<PrayerToday>(`/content/prayer-today${qs ? `?${qs}` : ''}`);
  },
  books: () => getJson<{ books: BibleBook[] }>('/bible/books'),
  chapter: (book: string, chapter: number, version?: string) =>
    getJson<{ verses: Verse[] }>(
      `/bible/chapter?book=${encodeURIComponent(book)}&chapter=${chapter}${version ? `&version=${encodeURIComponent(version)}` : ''}`,
    ),
  search: (q: string, opts?: { version?: string; testament?: 'OT' | 'NT' }) => {
    const params = new URLSearchParams({ q });
    if (opts?.version) params.set('version', opts.version);
    if (opts?.testament) params.set('testament', opts.testament);
    return getJson<{ hits: BibleSearchHit[]; version?: string; testament?: string }>(
      `/bible/search?${params.toString()}`,
    );
  },
  versions: () => getJson<{ versions: BibleVersion[] }>('/bible/versions'),
  compare: (ref: string) =>
    getJson<CompareResult>(`/bible/compare?ref=${encodeURIComponent(ref)}`),
  scriptureRef: (ref: string) =>
    getJson<{ ref: string; display: string; verses: Verse[] }>(
      `/bible/ref?ref=${encodeURIComponent(ref)}`,
    ),
  guide: (ref: string, knowledgeBaseId?: string | null) => {
    const q = new URLSearchParams({ ref });
    if (knowledgeBaseId) q.set('knowledge_base_id', knowledgeBaseId);
    return getJson<GuideResult>(`/guide/passage?${q}`);
  },
  // 内容
  plans: () => getJson<{ plans: PlanSummary[] }>('/content/plans'),
  planDetail: (planId: string) =>
    getJson<{ plan_id: string; title: string; type: string; days: unknown[] }>(
      `/content/plans/${encodeURIComponent(planId)}`,
    ),
  planScopes: () =>
    getJson<{ scopes: { id: string; label: string }[] }>('/content/plan-scopes'),
  // 创世记 50 次同行
  devotionalHomeCard: (seriesId = 'genesis_50_walk') =>
    getJson<DevotionalHomeCard>(
      `/content/devotionals/${encodeURIComponent(seriesId)}/home-card`,
      authHeaders(),
    ),
  devotionalSeries: (seriesId: string) =>
    getJson<DevotionalSeriesDetail>(
      `/content/devotionals/${encodeURIComponent(seriesId)}`,
      authHeaders(),
    ),
  devotionalDay: (seriesId: string, day: number) =>
    getJson<DevotionalDayDetail>(
      `/content/devotionals/${encodeURIComponent(seriesId)}/day/${day}`,
      authHeaders(),
    ),
  saveDevotionalProgress: (seriesId: string, day: number, tab: string) =>
    authed<{ ok: boolean; my_days: number; last_day: number; participants_count: number }>(
      `/content/devotionals/${encodeURIComponent(seriesId)}/progress`,
      { method: 'POST', body: { day, tab } },
    ),
  upsertDevotionalCheckin: (seriesId: string, day: number, emoji: string, body?: string) =>
    authed<{
      ok: boolean;
      checkin: DevotionalCheckin;
      my_days: number;
      day_checkins: number;
      participants_count: number;
      checked_days: number[];
    }>(`/content/devotionals/${encodeURIComponent(seriesId)}/day/${day}/checkin`, {
      method: 'POST',
      body: { emoji, body },
    }),
  deleteDevotionalCheckin: (seriesId: string, day: number) =>
    authed<{ ok: boolean; my_days: number }>(
      `/content/devotionals/${encodeURIComponent(seriesId)}/day/${day}/checkin`,
      { method: 'DELETE' },
    ),
  devotionalFeed: (seriesId: string, day: number) =>
    getJson<{ items: DevotionalCheckin[]; day_checkins: number; my_days: number }>(
      `/content/devotionals/${encodeURIComponent(seriesId)}/day/${day}/feed`,
      authHeaders(),
    ),
  reactDevotionalCheckin: (checkinId: string, emoji: string) =>
    authed<{ reactions: Record<string, string[]> }>(
      `/content/devotionals/checkins/${encodeURIComponent(checkinId)}/react`,
      { method: 'POST', body: { emoji } },
    ),
  commentDevotionalCheckin: (checkinId: string, body: string) =>
    authed<{ comment: DevotionalComment }>(
      `/content/devotionals/checkins/${encodeURIComponent(checkinId)}/comments`,
      { method: 'POST', body: { body } },
    ),
  deleteDevotionalComment: (commentId: string) =>
    authed<{ ok: boolean }>(
      `/content/devotionals/comments/${encodeURIComponent(commentId)}`,
      { method: 'DELETE' },
    ),
  reportDevotional: (targetType: 'checkin' | 'comment', targetId: string, reason?: string) =>
    authed<{ ok: boolean }>('/content/devotionals/report', {
      method: 'POST',
      body: { target_type: targetType, target_id: targetId, reason },
    }),

  campaignTemplates: () =>
    getJson<{
      templates: OpsCampaignTemplate[];
      domains?: Array<{ id: string; label: string }>;
    }>('/content/campaigns/templates', authHeaders()),
  campaignStaffGroups: () =>
    authed<{ groups: { id: string; name: string; role: string }[] }>('/content/campaigns/staff-groups'),
  myCampaigns: (status?: string) =>
    authed<{ campaigns: OpsCampaign[] }>(
      `/content/campaigns${status && status !== 'all' ? `?status=${encodeURIComponent(status)}` : ''}`,
    ),
  homeCampaigns: () =>
    getJson<{ campaigns: OpsHomeCampaign[] }>('/content/campaigns/home', authHeaders()),
  getCampaign: (id: string, preview?: boolean) =>
    getJson<{
      ok?: boolean;
      denied?: boolean;
      message?: string;
      teaser?: { id: string; name: string; tag: string; status: string };
      campaign?: OpsCampaignDetail;
    }>(
      `/content/campaigns/${encodeURIComponent(id)}${preview ? '?preview=1' : ''}`,
      authHeaders(),
    ),
  createCampaign: (body: OpsCampaignUpsert) =>
    authed<{ campaign: OpsCampaign }>('/content/campaigns', { method: 'POST', body }),
  updateCampaign: (id: string, body: OpsCampaignUpsert) =>
    authed<{ campaign: OpsCampaign }>(`/content/campaigns/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body,
    }),
  copyCampaign: (id: string) =>
    authed<{ campaign: OpsCampaign }>(`/content/campaigns/${encodeURIComponent(id)}/copy`, {
      method: 'POST',
      body: {},
    }),
  extendCampaign: (id: string, days = 7) =>
    authed<{ campaign: OpsCampaign }>(
      `/content/campaigns/${encodeURIComponent(id)}/extend`,
      { method: 'POST', body: { days } },
    ),
  deleteCampaign: (id: string) =>
    authed<{ ok: boolean }>(`/content/campaigns/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  toggleCampaignLike: (id: string) =>
    authed<{ liked: boolean; likesCount: number }>(
      `/content/campaigns/${encodeURIComponent(id)}/like`,
      { method: 'POST', body: {} },
    ),
  addCampaignComment: (id: string, body: string, day?: number) =>
    authed<{ comment: OpsCampaignComment }>(
      `/content/campaigns/${encodeURIComponent(id)}/comments`,
      { method: 'POST', body: { body, day } },
    ),
  upsertCampaignRsvp: (id: string, status: 'yes' | 'no' | 'maybe') =>
    authed<{ myRsvp: string; rsvpStats: Record<string, number> }>(
      `/content/campaigns/${encodeURIComponent(id)}/rsvp`,
      { method: 'POST', body: { status } },
    ),
  addCampaignPrayer: (id: string, body: string) =>
    authed<{ ok: boolean; id: string }>(
      `/content/campaigns/${encodeURIComponent(id)}/prayer`,
      { method: 'POST', body: { body } },
    ),
  markCampaignDayRead: (id: string, day: number) =>
    authed<{ readDays: number[] }>(
      `/content/campaigns/${encodeURIComponent(id)}/day-read`,
      { method: 'POST', body: { day } },
    ),
  toggleCampaignSignup: (id: string, slotId: string) =>
    authed<{
      joined: boolean;
      slotId: string;
      taken: number;
      remaining: number | null;
      mySlots: string[];
    }>(`/content/campaigns/${encodeURIComponent(id)}/signup`, {
      method: 'POST',
      body: { slotId },
    }),
  askCampaignQuestion: (id: string, body: string) =>
    authed<{
      question: {
        id: string;
        userId: string;
        body: string;
        answer: string | null;
        createdAt?: string | null;
      };
    }>(`/content/campaigns/${encodeURIComponent(id)}/questions`, {
      method: 'POST',
      body: { body },
    }),
  answerCampaignQuestion: (id: string, questionId: string, answer: string) =>
    authed<{ ok: boolean; answer: string }>(
      `/content/campaigns/${encodeURIComponent(id)}/questions/${encodeURIComponent(questionId)}/answer`,
      { method: 'POST', body: { answer } },
    ),
  listUserCampaignTemplates: () =>
    authed<{
      templates: Array<{
        id: string;
        name: string;
        baseTemplateId: string;
        landing: OpsCampaignLanding;
      }>;
    }>('/content/campaigns/user-templates'),
  saveUserCampaignTemplate: (body: {
    name: string;
    baseTemplateId: string;
    landing: OpsCampaignLanding;
  }) =>
    authed<{ ok: boolean; id: string }>('/content/campaigns/user-templates', {
      method: 'POST',
      body,
    }),
  deleteUserCampaignTemplate: (id: string) =>
    authed<{ ok: boolean }>(
      `/content/campaigns/user-templates/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    ),

  generatePlan: (scope: string | null, days: number, theme?: string, customRefs?: string) =>
    authed<GeneratedPlan>('/content/generate-plan', {
      method: 'POST',
      body: { scope: scope || undefined, days, theme, custom_refs: customRefs || undefined },
    }),
  crossrefs: (ref: string) =>
    getJson<CrossrefResult>(`/content/crossrefs?ref=${encodeURIComponent(ref)}`),
  strongs: (ref: string) =>
    getJson<StrongsResult>(`/content/strongs?ref=${encodeURIComponent(ref)}`),
  topics: (topic?: string) =>
    getJson<{ topics: TopicEntry[] } | TopicEntry>(
      topic ? `/content/topics?topic=${encodeURIComponent(topic)}` : '/content/topics',
    ),
  geography: (ref?: string, book?: string, chapter?: number) =>
    getJson<{ places: GeoPlace[] }>(
      book && chapter
        ? `/content/geography?book=${encodeURIComponent(book)}&chapter=${chapter}`
        : ref
          ? `/content/geography?ref=${encodeURIComponent(ref)}`
          : '/content/geography',
    ),
  timeline: (book?: string, chapter?: number) =>
    getJson<{ chapters?: TimelineChapter[]; timeline?: TimelineChapter | null }>(
      book && chapter
        ? `/content/timeline?book=${encodeURIComponent(book)}&chapter=${chapter}`
        : '/content/timeline',
    ),
  mapTours: () => getJson<{ tours: MapTour[] }>('/content/map-tours'),
  mapTour: (id: string) => getJson<{ tour: MapTour }>(`/content/map-tours/${encodeURIComponent(id)}`),
  timelineTours: () => getJson<{ tours: TimelineTour[] }>('/content/timeline-tours'),
  timelineTour: (id: string) =>
    getJson<{ tour: TimelineTour }>(`/content/timeline-tours/${encodeURIComponent(id)}`),
  bookSummaries: () => getJson<{ books: BookSummary[] }>('/content/summaries/books'),
  bookSummary: (book: string) =>
    getJson<{ summary: BookSummary }>(`/content/summaries/books/${encodeURIComponent(book)}`),
  chapterSummaries: (book: string, chapter?: number) =>
    getJson<{ chapters?: ChapterSummary[]; summary?: ChapterSummary | null }>(
      chapter
        ? `/content/summaries/chapters?book=${encodeURIComponent(book)}&chapter=${chapter}`
        : `/content/summaries/chapters?book=${encodeURIComponent(book)}`,
    ),
  relations: (entityId?: string) =>
    getJson<EntityGraph | { relations: EntityRelation[] }>(
      entityId
        ? `/content/relations?entity_id=${encodeURIComponent(entityId)}`
        : '/content/relations',
    ),
  entityKnowledge: (entityId: string, opts?: { graphLimit?: number }) => {
    const params = new URLSearchParams();
    if (opts?.graphLimit) params.set('graph_limit', String(opts.graphLimit));
    const qs = params.toString();
    return getJson<EntityKnowledge>(
      `/content/entities/${encodeURIComponent(entityId)}/knowledge${qs ? `?${qs}` : ''}`,
    );
  },
  diagrams: () => getJson<{ schema?: string; categories?: { id: string; label: string }[]; items: BibleDiagram[] }>('/content/diagrams'),
  diagram: (id: string) => getJson<{ diagram: BibleDiagram }>(`/content/diagrams/${encodeURIComponent(id)}`),
  diagramFileUrl: (id: string) =>
    contentAssetUrl(`/content/diagrams/${encodeURIComponent(id)}/file`),
  graphTopics: () => getJson<{ topics: GraphTopic[] }>('/content/graph-topics'),
  graphTopic: (id: string) =>
    getJson<{ topic: GraphTopic; graph: { nodes: EntityGraphNode[]; edges: EntityRelation[] } }>(
      `/content/graph-topics/${encodeURIComponent(id)}`,
    ),
  contentAttribution: () =>
    getJson<{ sources: { id: string; name: string; license: string; url: string }[] }>(
      '/content/attribution',
    ),
  dictionary: (term?: string, ref?: string) =>
    getJson<{ entities: DictEntity[] }>(
      `/content/dictionary${term || ref ? `?${new URLSearchParams({
        ...(term ? { term } : {}),
        ...(ref ? { ref } : {}),
      }).toString()}` : ''}`,
    ),
  sectionTitles: (book?: string, chapter?: number) =>
    getJson<{ chapters?: Record<string, { verse: number; title: string }[]>; sections?: { verse: number; title: string }[] }>(
      book && chapter
        ? `/content/sections?book=${encodeURIComponent(book)}&chapter=${chapter}`
        : '/content/sections',
    ),
  // 社交
  myGroups: () => authed<{ groups: Group[] }>('/social/groups'),
  discoverSummary: () => authed<DiscoverSummary>('/social/discover/summary'),
  pushDigest: () => authed<{ title: string; body: string; href: string; unread?: number }>('/social/push/digest'),
  deliverPushDigest: () => authed<{ ok: boolean; sent: number }>('/push/deliver-digest', { method: 'POST' }),
  createGroup: (name: string, intro?: string, plan_id?: string) =>
    authed<Group>('/social/groups', { method: 'POST', body: { name, intro, plan_id } }),
  createGroupFromPlan: (plan_id: string, name?: string) =>
    authed<Group>('/social/groups/from-plan', {
      method: 'POST',
      body: { plan_id, name },
    }),
  joinGroup: (join_code: string) =>
    authed<{ id: string; name: string }>('/social/groups/join', {
      method: 'POST',
      body: { join_code },
    }),
  groupDetail: (gid: string, opts?: { light?: boolean }) =>
    authed<GroupDetail>(
      `/social/groups/${gid}${opts?.light ? '?light=1' : ''}`,
    ),
  updateGroup: (
    gid: string,
    body: {
      name?: string;
      plan_id?: string | null;
      announcement?: string | null;
      clear_plan?: boolean;
    },
  ) =>
    authed<{ ok: boolean }>(`/social/groups/${gid}`, {
      method: 'PATCH',
      body,
    }),
  transferGroup: (gid: string, newOwnerId: string) =>
    authed<{ ok: boolean }>(`/social/groups/${gid}/transfer`, {
      method: 'POST',
      body: { new_owner_id: newOwnerId },
    }),
  removeGroupMember: (gid: string, userId: string) =>
    authed<{ ok: boolean }>(`/social/groups/${gid}/members/${userId}`, {
      method: 'DELETE',
    }),
  leaveGroup: (gid: string) =>
    authed<{ ok: boolean }>(`/social/groups/${gid}/members/me`, { method: 'DELETE' }),
  dissolveGroup: (gid: string) =>
    authed<{ ok: boolean }>(`/social/groups/${gid}`, { method: 'DELETE' }),
  updateGroupMemberName: (gid: string, display_name: string) =>
    authed<{ ok: boolean; display_name: string }>(`/social/groups/${gid}/members/me`, {
      method: 'PATCH',
      body: { display_name },
    }),
  groupFeed: (gid: string, opts?: { before?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (opts?.before) q.set('before', opts.before);
    if (opts?.limit) q.set('limit', String(opts.limit));
    const qs = q.toString();
    return authed<{ messages: GroupMessage[]; has_more: boolean }>(
      `/social/groups/${gid}/feed${qs ? `?${qs}` : ''}`,
    );
  },
  checkin: (gid: string, body: { body?: string; ref?: string; task_id?: string }) =>
    authed<{ id: string }>(`/social/groups/${gid}/checkin`, {
      method: 'POST',
      body,
    }),
  createTask: (
    gid: string,
    title: string,
    ref?: string,
    opts?: {
      due_at?: string;
      template_id?: string;
      task_type?: string;
      completion_rule?: string;
      body?: string;
      publish_at?: string;
      assignee_ids?: string[];
      attachments?: Array<{
        file_name: string;
        mime_type: string;
        size_bytes: number;
        storage_path: string;
        url: string;
      }>;
      series_days?: number;
      series_due_hours?: number;
    },
  ) =>
    authed<GroupTask & { ok?: boolean; series?: boolean; series_id?: string; task_ids?: string[] }>(
      `/social/groups/${gid}/tasks`,
      {
        method: 'POST',
        body: { title, ref, ...opts },
      },
    ),
  uploadTaskAttachment: async (gid: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${API_BASE}/social/groups/${gid}/tasks/upload`, {
      method: 'POST',
      headers: authHeaders(),
      body: form,
      cache: 'no-store',
    });
    if (!res.ok) {
      let detail = `${res.status}`;
      try {
        detail = (await res.json()).detail || detail;
      } catch {
        /* ignore */
      }
      throw new Error(typeof detail === 'string' ? detail : '上传失败');
    }
    return res.json() as Promise<{
      ok: boolean;
      file_name: string;
      mime_type: string;
      size_bytes: number;
      storage_path: string;
      url: string;
    }>;
  },
  nudgeGroup: (gid: string) =>
    authed<{ ok: boolean; pending_members: number; message?: string }>(
      `/social/groups/${gid}/nudge`,
      { method: 'POST' },
    ),
  muteGroup: (gid: string, muted: boolean) =>
    authed<{ ok: boolean; muted: boolean }>(`/social/groups/${gid}/mute?muted=${muted ? 'true' : 'false'}`, {
      method: 'PATCH',
    }),
  pinTask: (gid: string, tid: string) =>
    authed<{ ok: boolean; pinned_task_id: string }>(`/social/groups/${gid}/tasks/${tid}/pin`, {
      method: 'PATCH',
    }),
  react: (mid: string, emoji: string) =>
    authed<{ reactions: Record<string, string[]> }>(`/social/messages/${mid}/react`, {
      method: 'POST',
      body: { emoji },
    }),
  reportMessage: (mid: string, reason?: string) =>
    authed<{ ok: boolean; reports: number; hidden: boolean }>(
      `/social/messages/${mid}/report`,
      { method: 'POST', body: { reason } },
    ),
  reportContent: (
    targetType: 'group_message' | 'dm' | 'group' | 'user',
    targetId: string,
    reason: 'spam' | 'abuse' | 'heresy' | 'illegal' | 'other',
  ) =>
    authed<{ id: string; status: string }>('/social/reports', {
      method: 'POST',
      body: { target_type: targetType, target_id: targetId, reason },
    }),
  deleteMessage: (mid: string) =>
    authed<{ ok: boolean }>(`/social/messages/${mid}`, { method: 'DELETE' }),
  reactMessage: (mid: string, emoji: string) =>
    authed<{ ok: boolean }>(`/social/messages/${mid}/react`, { method: 'POST', body: { emoji } }),
  sendGroupInvites: (gid: string, friendIds: string[]) =>
    authed<{ ok: boolean; sent: number }>(`/social/groups/${gid}/invites`, {
      method: 'POST',
      body: { friend_ids: friendIds },
    }),
  groupInviteInbox: () => authed<{ invites: GroupInviteInboxItem[] }>('/social/invites/inbox'),
  acceptGroupInvite: (id: string) =>
    authed<{ ok: boolean; group_id: string; name: string }>(`/social/invites/${id}/accept`, {
      method: 'POST',
    }),
  declineGroupInvite: (id: string) =>
    authed<{ ok: boolean }>(`/social/invites/${id}/decline`, { method: 'POST' }),
  friends: () => authed<{ friends: Friend[] }>('/social/friends'),
  socialMe: () =>
    authed<{
      user_id: string;
      user_code?: string | null;
      handle?: string | null;
      display_name?: string | null;
    }>('/social/me'),
  conversations: () => authed<{ items: ConversationItem[] }>('/social/conversations'),
  friendRequests: () =>
    authed<{ incoming: FriendRequestItem[]; outgoing: FriendRequestItem[] }>(
      '/social/friend-requests',
    ),
  acceptFriendRequest: (id: string) =>
    authed<{ ok: boolean; friend_id?: string }>(`/social/friend-requests/${id}/accept`, {
      method: 'POST',
    }),
  declineFriendRequest: (id: string) =>
    authed<{ ok: boolean }>(`/social/friend-requests/${id}/decline`, { method: 'POST' }),
  openDm: (peerId: string) =>
    authed<{ thread_id: string; peer_user_id: string }>(`/social/dm/with/${peerId}`, {
      method: 'POST',
    }),
  dmMessages: (
    threadId: string,
    opts?: { limit?: number; before?: string },
  ) => {
    const limit = opts?.limit ?? 50;
    const q = new URLSearchParams({ limit: String(limit) });
    if (opts?.before) q.set('before', opts.before);
    return authed<{
      messages: DmMessage[];
      has_more?: boolean;
      peer_last_read_at?: string | null;
      peer_user_id?: string;
      peer_title?: string | null;
    }>(`/social/dm/${threadId}/messages?${q}`);
  },
  sendDm: (
    threadId: string,
    body: { body?: string; kind?: string; ref?: string; reply_to_id?: string },
  ) =>
    authed<{ id: string; created_at?: string }>(`/social/dm/${threadId}/messages`, {
      method: 'POST',
      body,
    }),
  sendGroupChat: (
    gid: string,
    body: string,
    opts?: { replyToId?: string; mentions?: string[] },
  ) =>
    authed<{ id: string }>(`/social/groups/${gid}/chat`, {
      method: 'POST',
      body: {
        body,
        reply_to_id: opts?.replyToId,
        mentions: opts?.mentions,
      },
    }),
  patchConversationState: (
    scope: string,
    refId: string,
    body: { last_read_at?: string; pinned?: boolean; muted?: boolean; hidden?: boolean },
  ) =>
    authed<{ ok: boolean }>(`/social/conversations/${scope}/${refId}/state`, {
      method: 'PATCH',
      body,
    }),
  recallMessage: (mid: string) =>
    authed<{ ok: boolean }>(`/social/messages/${mid}/recall`, { method: 'POST' }),
  realtimeCursor: () =>
    authed<{ group_max?: string | null; dm_max?: string | null; server_time: string }>(
      '/social/realtime/cursor',
    ),
  searchMessages: (
    q: string,
    opts?: { scope?: 'group' | 'dm'; refId?: string; limit?: number },
  ) => {
    const params = new URLSearchParams({ q });
    if (opts?.scope) params.set('scope', opts.scope);
    if (opts?.refId) params.set('ref_id', opts.refId);
    if (opts?.limit) params.set('limit', String(opts.limit));
    return authed<{
      items: Array<{
        scope: string;
        message_id: string;
        ref_id: string;
        title: string;
        kind: string;
        snippet: string;
        created_at?: string | null;
      }>;
    }>(`/social/search/messages?${params}`);
  },
  uploadSocialMedia: (
    file: File,
    opts?: { onProgress?: (pct: number) => void },
  ) =>
    new Promise<{
      ok: boolean;
      kind: string;
      file_name: string;
      mime_type: string;
      size_bytes: number;
      storage_key: string;
      url: string;
    }>((resolve, reject) => {
      const form = new FormData();
      form.append('file', file);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE}/social/uploads`);
      const headers = authHeaders();
      for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
      xhr.upload.onprogress = (ev) => {
        if (!ev.lengthComputable || !opts?.onProgress) return;
        opts.onProgress(Math.min(99, Math.round((ev.loaded / ev.total) * 100)));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          opts?.onProgress?.(100);
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch {
            reject(new Error('上传响应异常'));
          }
          return;
        }
        let detail = `${xhr.status}`;
        try {
          detail = JSON.parse(xhr.responseText).detail || detail;
        } catch {
          /* ignore */
        }
        reject(new Error(typeof detail === 'string' ? detail : '上传失败'));
      };
      xhr.onerror = () => reject(new Error('网络异常，上传失败'));
      xhr.send(form);
    }),
  sendGroupMedia: (
    gid: string,
    body: {
      storage_key: string;
      file_name?: string;
      mime?: string;
      size_bytes?: number;
      url?: string;
      body?: string;
      mentions?: string[];
      reply_to_id?: string;
    },
  ) =>
    authed<{ id: string; kind: string }>(`/social/groups/${gid}/media`, {
      method: 'POST',
      body,
    }),
  sendDmMedia: (
    threadId: string,
    body: {
      storage_key: string;
      file_name?: string;
      mime?: string;
      size_bytes?: number;
      url?: string;
      body?: string;
      reply_to_id?: string;
    },
  ) =>
    authed<{ id: string; kind: string }>(`/social/dm/${threadId}/media`, {
      method: 'POST',
      body,
    }),
  previewSocialMedia: async (storageKey: string) => {
    const res = await fetch(
      `${API_BASE}/social/media/preview?storage_key=${encodeURIComponent(storageKey)}`,
      { headers: authHeaders() },
    );
    if (!res.ok) {
      let detail = `${res.status}`;
      try {
        const j = await res.json();
        detail = j.detail || detail;
      } catch {
        /* ignore */
      }
      throw new Error(typeof detail === 'string' ? detail : '预览失败');
    }
    return res.blob();
  },
  setAllowChat: (gid: string, allow_chat: boolean) =>
    authed<{ ok: boolean }>(`/social/groups/${gid}/allow-chat`, {
      method: 'PATCH',
      body: { allow_chat },
    }),
  setGroupAdmins: (gid: string, user_ids: string[]) =>
    authed<{ ok: boolean }>(`/social/groups/${gid}/admins`, {
      method: 'POST',
      body: { user_ids },
    }),
  addFriend: (handle: string, message?: string) =>
    authed<{
      id?: string;
      status?: string;
      to_user_id?: string;
      friend_id?: string;
      pending?: boolean;
      message?: string;
    }>('/social/friends', {
      method: 'POST',
      body: { handle, ...(message?.trim() ? { message: message.trim() } : {}) },
    }),
  removeFriend: (friendId: string) =>
    authed<{ ok: boolean }>(`/social/friends/${friendId}`, { method: 'DELETE' }),
  groupPendingInvites: (gid: string) =>
    authed<{ friend_ids: string[] }>(`/social/groups/${gid}/invites/pending`),
  cancelGroupInvite: (gid: string, friendId: string) =>
    authed<{ ok: boolean }>(`/social/groups/${gid}/invites/${friendId}`, { method: 'DELETE' }),
};

export interface DmMessage {
  id: string;
  sender_id: string;
  kind: string;
  body?: string | null;
  ref?: string | null;
  reply_to_id?: string | null;
  recalled?: boolean;
  created_at?: string | null;
  mine?: boolean;
  reactions?: Record<string, string[]>;
  attachments?: Array<{
    id: string;
    file_name?: string | null;
    mime?: string | null;
    size_bytes?: number | null;
    storage_key?: string | null;
    url?: string | null;
  }>;
}
