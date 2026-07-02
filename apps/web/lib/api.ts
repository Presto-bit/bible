// 后端 API 基址（与移动端共用同一 FastAPI）。
import {
  bindDeviceGuestId,
  getDeviceBoundGuestId,
  getDeviceId,
  hydrateIdentityFromIdb,
} from './device_id';
import { deviceIdToUserCode, isUserCode, USER_CODE_RE } from './user_code';

export { getDeviceId } from './device_id';
export { deviceIdToUserCode, isUserCode, USER_CODE_LEN, USER_CODE_RE } from './user_code';

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || 'https://2sc.prestoai.cn';

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

async function refreshAccountStatus(code: string): Promise<void> {
  try {
    const res = await fetch(
      `${API_BASE}/auth/account-status?user_code=${encodeURIComponent(code)}`,
      { cache: 'no-store' },
    );
    if (!res.ok) return;
    const d = await res.json();
    if (d.username) localStorage.setItem(NAME_KEY, d.username);
    setHasPasswordCached(Boolean(d.has_password));
  } catch {
    /* 离线跳过 */
  }
}

let ensureIdentityPromise: Promise<void> | null = null;

/** 启动时：IDB 恢复 → 服务端按 device_id 找回 user_code */
export async function ensureIdentityReady(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (ensureIdentityPromise) return ensureIdentityPromise;
  ensureIdentityPromise = (async () => {
    await hydrateIdentityFromIdb();
    let g = localStorage.getItem(GUEST_KEY);
    if (g && isUserCode(g)) {
      bindDeviceGuestId(g);
      return;
    }
    const bound = getDeviceBoundGuestId();
    if (bound) {
      localStorage.setItem(GUEST_KEY, bound);
      ensureFirstSeen();
      return;
    }
    const deviceId = getDeviceId();
    if (deviceId) {
      try {
        const res = await fetch(
          `${API_BASE}/auth/device-user?device_id=${encodeURIComponent(deviceId)}`,
          { cache: 'no-store' },
        );
        if (res.ok) {
          const d = (await res.json()) as { user_code?: string | null };
          if (d.user_code && isUserCode(d.user_code)) {
            localStorage.setItem(GUEST_KEY, d.user_code);
            bindDeviceGuestId(d.user_code);
            ensureFirstSeen();
            return;
          }
        }
      } catch {
        /* 离线：走本地确定性 ID */
      }
    }
    guestId();
  })();
  return ensureIdentityPromise;
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
          'X-Device-Id': getDeviceId(),
        },
        body: JSON.stringify({ user_code: code }),
      });
      if (res.ok) {
        const d = await res.json();
        if (d.username) localStorage.setItem(NAME_KEY, d.username);
        setHasPasswordCached(Boolean(d.has_password));
      }
    } catch {
      /* 离线：本地 ID 仍可用 */
    }
    await refreshAccountStatus(code);
    void import('./post_login').then((m) => m.mergeGuest()).catch(() => {});
  })();
  return ensureAccountPromise;
}

/** 游客 ID：绑定本设备；清 localStorage 后尝试 IndexedDB 恢复 */
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
  g = deviceIdToUserCode(deviceId);
  localStorage.setItem(GUEST_KEY, g);
  bindDeviceGuestId(g);
  ensureFirstSeen();
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_code: id,
        username: u || null,
        password: password || null,
      }),
    });
    if (res.ok) {
      const d = await res.json();
      setHasPasswordCached(Boolean(d.has_password));
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
      headers: { 'Content-Type': 'application/json' },
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
  setHasPasswordCached(Boolean(d.has_password));
  markOnboarded();
  void import('./post_login').then((m) => m.afterLogin());
  return code;
}

export function logout() {
  if (typeof window !== 'undefined') localStorage.removeItem(USER_KEY);
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

export interface ChatStreamBody {
  ref?: string | null;
  question: string;
  mode: string;
  scene?: string;
  history?: ChatHistoryTurn[];
}

export interface ChatMetaPayload {
  citations: Citation[];
  scene?: string;
  scene_label?: string;
  mode?: string;
  mode_label?: string;
  display?: string;
  wants_followups?: boolean;
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
        : '今日免费次数已用完，登录后可继续使用',
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
  days: { day: number; title: string; refs: string[] }[];
  saved_at?: number;
}
export interface DictEntity {
  name: string;
  type: string;
  summary: string;
  refs: string[];
}
export interface CrossrefResult {
  label: string;
  related: { ref: string; text: string }[];
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
  dailyVerse: (day?: number) =>
    getJson<DailyVerse>(
      `/content/daily-verse${day != null ? `?day=${day}` : ''}`,
      authHeaders(),
    ),
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
  dailyDevotional: () => getJson<DailyDevotional>('/content/daily-devotional'),
  prayerToday: () => getJson<PrayerToday>('/content/prayer-today'),
  books: () => getJson<{ books: BibleBook[] }>('/bible/books'),
  chapter: (book: string, chapter: number, version?: string) =>
    getJson<{ verses: Verse[] }>(
      `/bible/chapter?book=${encodeURIComponent(book)}&chapter=${chapter}${version ? `&version=${encodeURIComponent(version)}` : ''}`,
    ),
  search: (q: string) =>
    getJson<{ hits: BibleSearchHit[] }>(
      `/bible/search?q=${encodeURIComponent(q)}`,
    ),
  versions: () => getJson<{ versions: BibleVersion[] }>('/bible/versions'),
  compare: (ref: string) =>
    getJson<CompareResult>(`/bible/compare?ref=${encodeURIComponent(ref)}`),
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
  dictionary: (term?: string) =>
    getJson<{ entities: DictEntity[] }>(
      `/content/dictionary${term ? `?term=${encodeURIComponent(term)}` : ''}`,
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
  friends: () => authed<{ friends: Friend[] }>('/social/friends'),
  addFriend: (handle: string) =>
    authed<Friend>('/social/friends', { method: 'POST', body: { handle } }),
  publishShare: (body: { ref?: string; body: string; kind?: string }) =>
    authed<{ id: string; created_at: string }>('/social/shares', {
      method: 'POST',
      body,
    }),
};
