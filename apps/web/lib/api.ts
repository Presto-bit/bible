// 后端 API 基址（与移动端共用同一 FastAPI）。
import { chinaTodayYmd } from './daily_clock';
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

export { getDeviceId, stableDeviceFingerprint } from './device_id';
export { deviceIdToUserCode, isUserCode, USER_CODE_LEN, USER_CODE_RE } from './user_code';

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
  const res = await fetch(`${API_BASE}${path}`, {
    cache: 'no-store',
    headers: headers ? { ...headers } : undefined,
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

async function refreshAccountStatus(code: string): Promise<void> {
  try {
    const res = await fetch(
      `${API_BASE}/auth/account-status?user_code=${encodeURIComponent(code)}`,
      { cache: 'no-store' },
    );
    if (!res.ok) return;
    const d = await res.json();
    if (d.username) localStorage.setItem(NAME_KEY, d.username);
    applyAccountPhone(d.phone ?? null, code);
    if (d.has_password) setHasPasswordCached(true);
    else if (!localStorage.getItem(NAME_KEY)?.trim()) setHasPasswordCached(false);
    // 服务端已有用户名+密码时，视为引导完成
    if (d.username && d.has_password) markOnboarded();
  } catch {
    /* 离线跳过 */
  }
}

function deviceHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  const deviceId = getDeviceId();
  const fingerprint = stableDeviceFingerprint() || deviceId;
  if (deviceId) h['X-Device-Id'] = deviceId;
  if (fingerprint) h['X-Device-Fingerprint'] = fingerprint;
  return h;
}

function applyServerUserCode(code: string): void {
  if (!isUserCode(code)) return;
  localStorage.setItem(GUEST_KEY, code);
  bindDeviceGuestId(code);
  if (!currentUserId()) localStorage.setItem(USER_KEY, code);
}

let ensureIdentityPromise: Promise<void> | null = null;

/** 丢弃本地账号缓存（保留安装级 device_id），用于服务端已解绑时自动换新 ID */
function clearLocalAccountIdentity() {
  localStorage.removeItem(GUEST_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(PHONE_KEY);
  localStorage.removeItem(PHONE_OWNER_KEY);
  localStorage.removeItem(NAME_KEY);
  localStorage.removeItem(HAS_PWD_KEY);
  localStorage.removeItem(ONBOARDED_KEY);
  clearDeviceGuestBinding();
}

/** 启动时：解析 device_id → 以服务端设备绑定为准分配 user_code */
export async function ensureIdentityReady(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (ensureIdentityPromise) return ensureIdentityPromise;
  ensureIdentityPromise = (async () => {
    await resolveDeviceId();
    const deviceId = getDeviceId();

    // 在线：服务端绑定优先；未绑定则自动换新账号（清库/撞号后两台设备无需手动点）
    if (deviceId && !deviceId.startsWith('dev-')) {
      try {
        const params = new URLSearchParams({ device_id: deviceId });
        const res = await fetch(`${API_BASE}/auth/device-user?${params}`, { cache: 'no-store' });
        if (res.ok) {
          const d = (await res.json()) as { user_code?: string | null };
          if (d.user_code && isUserCode(d.user_code)) {
            applyServerUserCode(d.user_code);
            ensureFirstSeen();
            markIdentityBootstrapped();
            return;
          }
          // 服务端未绑定：若本地已设好用户名+密码，保留并稍后 register 重新绑定（避免反复清空又提示设置）
          const local = localStorage.getItem(GUEST_KEY);
          if (local && isUserCode(local) && localStorage.getItem(NAME_KEY)?.trim()
            && localStorage.getItem(HAS_PWD_KEY) === '1') {
            bindDeviceGuestId(local);
            ensureFirstSeen();
            markIdentityBootstrapped();
            return;
          }
          // 本地也无完整账号 → 按 device_id 生成新 ID（清库/撞号后自动换号）
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
  })();
  return ensureIdentityPromise;
}

if (typeof window !== 'undefined') {
  void ensureIdentityReady();
}

/** 首次打开静默建档，写入登录态并 merge-guest（P0/P2） */
export async function ensureAccountReady(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (ensureAccountPromise) return ensureAccountPromise;
  ensureAccountPromise = (async () => {
    await ensureIdentityReady();
    const code = guestId();
    if (!code) return;
    const loggedIn = currentUserId();
    if (!loggedIn) localStorage.setItem(USER_KEY, code);
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...deviceHeaders(),
        },
        body: JSON.stringify({ user_code: code }),
      });
      if (res.ok) {
        const d = await res.json();
        if (d.user_code && isUserCode(d.user_code)) applyServerUserCode(d.user_code);
        if (d.username) localStorage.setItem(NAME_KEY, d.username);
        // 勿用「无密码」覆盖本地已确认的设密状态（避免 register 回包异常导致反复引导）
        if (d.has_password) setHasPasswordCached(true);
        else if (localStorage.getItem(HAS_PWD_KEY) !== '1') setHasPasswordCached(false);
      }
    } catch {
      /* 离线：本地 ID 仍可用 */
    }
    const finalCode = guestId() || code;
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
  return localStorage.getItem(NAME_KEY) || '';
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

/** 首页问候等展示名：优先用户名，否则游客 ID 后缀。 */
export function getDisplayName(): string {
  const name = getUserName().trim();
  if (name) return name;
  const g = guestId();
  return g ? `用户${g.slice(-4)}` : '朋友';
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
    localStorage.setItem(NAME_KEY, u);
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
      if (d.user_code && isUserCode(d.user_code)) applyServerUserCode(d.user_code);
      if (d.username) localStorage.setItem(NAME_KEY, d.username);
      // 本次提交了密码则本地直接记为已设密，避免回包缺字段导致引导不消失
      if (password.length >= 6 || d.has_password) setHasPasswordCached(true);
      else setHasPasswordCached(Boolean(d.has_password));
      await refreshAccountStatus((d.user_code as string) || id);
    } else if (password) {
      throw new Error('保存失败，请检查网络');
    }
  } catch (e) {
    if (password) throw e instanceof Error ? e : new Error(String(e));
  }
  void import('./post_login').then((m) => m.afterLogin());
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
  setHasPasswordCached(true);
}

// 登录：标识符可为 8/10 位用户ID，或用户名（需配密码）。必须经服务端校验。
export async function loginWithIdentifier(identifier: string, password: string): Promise<string> {
  const idf = identifier.trim();
  if (!idf) throw new Error('请输入用户ID或用户名');

  if (!/^\d{8}$/.test(idf) && !/^\d{10}$/.test(idf) && !password) {
    throw new Error('用户名登录需要密码');
  }

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
  localStorage.setItem(GUEST_KEY, code);
  bindDeviceGuestId(code);
  localStorage.setItem(USER_KEY, code);
  if (d.username) localStorage.setItem(NAME_KEY, d.username);
  applyAccountPhone(d.phone ?? null, code);
  setHasPasswordCached(Boolean(d.has_password));
  markOnboarded();
  void import('./post_login').then((m) => m.afterLogin());
  return code;
}

export function logout() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(PHONE_KEY);
  localStorage.removeItem(PHONE_OWNER_KEY);
}

/**
 * 本机误绑他人账号时：清除身份并刷新，生成新的用户 ID。
 * （同型号手机曾因硬件指纹撞号共用一个账号。）
 */
export async function startFreshAccount(): Promise<void> {
  ensureAccountPromise = null;
  ensureIdentityPromise = null;
  await resetInstallIdentity();
  await ensureIdentityReady();
  await ensureAccountReady();
}

export interface Citation {
  n: number;
  title: string;
  score: number;
  snippet?: string;
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
    'X-Guest-Id': getDeviceId(),
    'X-Device-Id': getDeviceId(),
  };
  const code = effectiveId();
  if (code) {
    headers['X-User-Code'] = code;
    headers['X-User-Id'] = code;
  }

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

// ── 带认证头的请求（X-User-Id / X-Guest-Id；登录用户服务端为准） ──
export function authHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  const device = getDeviceId();
  if (device) {
    h['X-Guest-Id'] = device;
    h['X-Device-Id'] = device;
  }
  const fp = stableDeviceFingerprint();
  if (fp) h['X-Device-Fingerprint'] = fp;
  const code = effectiveId();
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
export interface GroupTask {
  id: string;
  title: string;
  ref?: string | null;
  due_at?: string | null;
  completed?: boolean;
  pinned?: boolean;
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
}
export interface DiscoverSummary {
  groups_pending_checkin: number;
  groups_pending_tasks: number;
  friends_checked_in_today: number;
  first_pending_group_id?: string | null;
}
export interface FriendActivity {
  id: string;
  author_id?: string;
  author: string;
  ref?: string | null;
  body?: string | null;
  reactions: Record<string, string[]>;
  created_at: string;
  source: 'group' | 'share';
  kind?: string;
  group_id?: string | null;
  group_name?: string | null;
}
export interface Friend {
  user_id: string;
  handle?: string | null;
  display_name?: string | null;
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
}

export const api = {
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
  guide: (ref: string) =>
    getJson<GuideResult>(`/guide/passage?ref=${encodeURIComponent(ref)}`),
  // 内容
  plans: () => getJson<{ plans: PlanSummary[] }>('/content/plans'),
  planDetail: (planId: string) =>
    getJson<{ plan_id: string; title: string; type: string; days: unknown[] }>(
      `/content/plans/${encodeURIComponent(planId)}`,
    ),
  planScopes: () =>
    getJson<{ scopes: { id: string; label: string }[] }>('/content/plan-scopes'),
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
  pushDigest: () => authed<{ title: string; body: string; href: string }>('/social/push/digest'),
  deliverPushDigest: () => authed<{ ok: boolean; sent: number }>('/push/deliver-digest', { method: 'POST' }),
  friendsActivity: () => authed<{ items: FriendActivity[] }>('/social/friends/activity'),
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
  groupDetail: (gid: string) => authed<GroupDetail>(`/social/groups/${gid}`),
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
  createTask: (gid: string, title: string, ref?: string, opts?: { due_at?: string; template_id?: string }) =>
    authed<GroupTask>(`/social/groups/${gid}/tasks`, {
      method: 'POST',
      body: { title, ref, ...opts },
    }),
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
  addFriend: (handle: string) =>
    authed<Friend>('/social/friends', { method: 'POST', body: { handle } }),
  removeFriend: (friendId: string) =>
    authed<{ ok: boolean }>(`/social/friends/${friendId}`, { method: 'DELETE' }),
  groupPendingInvites: (gid: string) =>
    authed<{ friend_ids: string[] }>(`/social/groups/${gid}/invites/pending`),
  cancelGroupInvite: (gid: string, friendId: string) =>
    authed<{ ok: boolean }>(`/social/groups/${gid}/invites/${friendId}`, { method: 'DELETE' }),
  publishShare: (body: { ref?: string; body: string; kind?: string }) =>
    authed<{ id: string; created_at: string }>('/social/shares', {
      method: 'POST',
      body,
    }),
};
