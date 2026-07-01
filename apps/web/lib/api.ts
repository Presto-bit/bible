// 后端 API 基址（与移动端共用同一 FastAPI）。
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

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`请求失败 ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

// ── 身份（本地优先：免注册 10 位数字 ID 即唯一标识） ──
const GUEST_KEY = 'presto_guest_id';
const USER_KEY = 'presto_user_id';
const NAME_KEY = 'profile_name';
const PWD_KEY = 'account_pwd';
const ONBOARDED_KEY = 'account_onboarded';
// 本地账号注册表：用户名 → { id, pwd }，用于离线唯一校验与用户名+密码登录。
const REGISTRY_KEY = 'account_registry';

// 随机 10 位数字用户ID（首位非 0）。免注册即用，作为持久身份。
function gen10DigitId(): string {
  let s = String(1 + Math.floor(Math.random() * 9));
  for (let i = 0; i < 9; i += 1) s += Math.floor(Math.random() * 10);
  return s;
}

const FIRST_SEEN_KEY = 'presto_first_seen';

export function guestId(): string {
  if (typeof window === 'undefined') return '';
  let g = localStorage.getItem(GUEST_KEY);
  if (!g || !/^\d{10}$/.test(g)) {
    g = gen10DigitId();
    localStorage.setItem(GUEST_KEY, g);
    if (!localStorage.getItem(FIRST_SEEN_KEY)) {
      localStorage.setItem(FIRST_SEEN_KEY, String(Date.now()));
    }
  }
  return g;
}

// 注册（首次使用）年份；用于读经回顾「注册年→当年」范围。
export function registrationYear(): number {
  if (typeof window === 'undefined') return new Date().getFullYear();
  const raw = localStorage.getItem(FIRST_SEEN_KEY);
  const ts = raw ? Number(raw) : NaN;
  if (Number.isFinite(ts) && ts > 0) return new Date(ts).getFullYear();
  return new Date().getFullYear();
}

// 当前生效的用户 ID：登录后的 ID，否则免注册游客 ID。两者都是 10 位数字。
export function currentUserId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(USER_KEY);
}

// 对外统一的「我的用户ID」（始终有值：登录 ID 或游客 ID）。
export function effectiveId(): string {
  return currentUserId() || guestId();
}

interface RegistryEntry {
  id: string;
  pwd: string;
}
function readRegistry(): Record<string, RegistryEntry> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(REGISTRY_KEY) || '{}');
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

// 设置名称 + 密码（首次引导 / 修改）。绑定到当前用户 ID。
export async function setCredentials(username: string, password: string): Promise<void> {
  const u = username.trim();
  const id = effectiveId();
  if (u) {
    const reg = readRegistry();
    // 清掉同 ID 的旧用户名映射，避免残留
    for (const key of Object.keys(reg)) {
      if (reg[key].id === id) delete reg[key];
    }
    reg[u] = { id, pwd: password };
    writeRegistry(reg);
    localStorage.setItem(NAME_KEY, u);
  }
  if (password) localStorage.setItem(PWD_KEY, password);
  markOnboarded();
  // 确保以该 ID 作为登录身份（用于云端数据归属）
  localStorage.setItem(USER_KEY, id);
  try {
    await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_code: id, username: u || null, password: password || null }),
    });
  } catch {
    /* 后端不可用：本地已生效 */
  }
}

// 登录：标识符可为 10 位用户ID，或用户名（需配密码）。
export async function loginWithIdentifier(identifier: string, password: string): Promise<string> {
  const idf = identifier.trim();
  if (!idf) throw new Error('请输入用户ID或用户名');

  // 1) 10 位数字 → 直接以该用户ID登录（采用该身份，云端数据按 ID 归属）
  if (/^\d{10}$/.test(idf)) {
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: idf, password: password || null }),
      });
      if (res.ok) {
        const d = await res.json();
        localStorage.setItem(USER_KEY, d.user_code || idf);
        if (d.username) localStorage.setItem(NAME_KEY, d.username);
        markOnboarded();
        return d.user_code || idf;
      }
      if (res.status === 401) throw new Error('密码不正确');
    } catch (e) {
      if (e instanceof Error && e.message === '密码不正确') throw e;
      /* 后端不可用：本地采用该 ID */
    }
    localStorage.setItem(USER_KEY, idf);
    markOnboarded();
    return idf;
  }

  // 2) 用户名 + 密码
  if (!password) throw new Error('用户名登录需要密码');
  // 本地注册表优先（离线可用）
  const reg = readRegistry();
  const entry = reg[idf];
  if (entry) {
    if (entry.pwd !== password) throw new Error('用户名或密码错误');
    localStorage.setItem(USER_KEY, entry.id);
    localStorage.setItem(NAME_KEY, idf);
    markOnboarded();
    return entry.id;
  }
  // 后端登录
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: idf, password }),
    });
    if (res.ok) {
      const d = await res.json();
      localStorage.setItem(USER_KEY, d.user_code);
      localStorage.setItem(NAME_KEY, d.username || idf);
      markOnboarded();
      return d.user_code as string;
    }
  } catch {
    /* fallthrough */
  }
  throw new Error('用户名或密码错误');
}

export function logout() {
  if (typeof window !== 'undefined') localStorage.removeItem(USER_KEY);
}

export interface Citation {
  n: number;
  title: string;
  score: number;
}

export interface ChatCallbacks {
  onMeta?: (meta: { citations: Citation[]; quota?: { used: number; limit: number } }) => void;
  onDelta?: (text: string) => void;
  onError?: (msg: string) => void;
  onDone?: () => void;
}

// SSE over POST（浏览器 EventSource 不支持 POST，手动解析流）。
export async function chatStream(
  body: { ref?: string | null; question: string; mode: string },
  cb: ChatCallbacks,
  opts?: { signal?: AbortSignal },
): Promise<void> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Guest-Id': guestId(),
  };
  const uid = currentUserId();
  if (uid) headers['X-User-Id'] = uid;

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
    cb.onError?.('今日免费次数已用完，登录后可继续使用');
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
  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (line.startsWith('event:')) {
          event = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          const json = line.slice(5).trim();
          if (!json) continue;
          try {
            const d = JSON.parse(json);
            if (event === 'meta') cb.onMeta?.(d);
            else if (event === 'delta') {
              gotDelta = true;
              cb.onDelta?.(d.text ?? '');
            } else if (event === 'error') cb.onError?.(d.message ?? '出错了');
            else if (event === 'done') cb.onDone?.();
          } catch {
            /* 跳过不完整片段 */
          }
        }
      }
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
function authHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  const uid = currentUserId();
  if (uid) h['X-User-Id'] = uid;
  const g = guestId();
  if (g) h['X-Guest-Id'] = g;
  return h;
}

async function authed<T>(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
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
}
export interface GroupTask {
  id: string;
  title: string;
  ref?: string | null;
}
export interface GroupMember {
  name: string;
  role: string;
}
export interface GroupDetail {
  id: string;
  name: string;
  intro?: string | null;
  join_code: string;
  role: string;
  members: GroupMember[];
  tasks: GroupTask[];
}
export interface GroupMessage {
  id: string;
  author: string;
  mine: boolean;
  kind: string;
  ref?: string | null;
  body?: string | null;
  reactions: Record<string, string[]>;
  created_at: string;
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
  dailyVerse: () => getJson<DailyVerse>('/content/daily-verse'),
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
  createGroup: (name: string, intro?: string) =>
    authed<Group>('/social/groups', { method: 'POST', body: { name, intro } }),
  joinGroup: (join_code: string) =>
    authed<{ id: string; name: string }>('/social/groups/join', {
      method: 'POST',
      body: { join_code },
    }),
  groupDetail: (gid: string) => authed<GroupDetail>(`/social/groups/${gid}`),
  groupFeed: (gid: string) =>
    authed<{ messages: GroupMessage[] }>(`/social/groups/${gid}/feed`),
  checkin: (gid: string, body: { body?: string; ref?: string; task_id?: string }) =>
    authed<{ id: string }>(`/social/groups/${gid}/checkin`, {
      method: 'POST',
      body,
    }),
  createTask: (gid: string, title: string, ref?: string) =>
    authed<GroupTask>(`/social/groups/${gid}/tasks`, {
      method: 'POST',
      body: { title, ref },
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
};
