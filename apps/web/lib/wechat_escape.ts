/** 微信逃逸 → 系统浏览器安装：会话标记 + 装后深链 */

export const WECHAT_ESCAPE_KEY = 'presto_wechat_escape';
export const POST_INSTALL_PATH_KEY = 'presto_post_install_path';
export const FROM_WECHAT_PARAM = 'fw';

export function markWechatEscapeIntent(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(WECHAT_ESCAPE_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function hasWechatEscapeIntent(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(WECHAT_ESCAPE_KEY) === '1';
  } catch {
    return false;
  }
}

/** 读取并可选清除逃逸标记 */
export function consumeWechatEscapeIntent(clear = true): boolean {
  const hit = hasWechatEscapeIntent();
  if (hit && clear) {
    try {
      sessionStorage.removeItem(WECHAT_ESCAPE_KEY);
    } catch {
      /* ignore */
    }
  }
  return hit;
}

/** 安装前记住分享落地路径，standalone 首启可回到同一内容 */
export function notePostInstallPath(path?: string): void {
  if (typeof window === 'undefined') return;
  const raw = (path || `${window.location.pathname}${window.location.search}`).trim();
  if (!raw || raw === '/') return;
  if (!raw.startsWith('/share/') && !raw.startsWith('/reader') && !raw.startsWith('/assistant')) {
    return;
  }
  try {
    localStorage.setItem(POST_INSTALL_PATH_KEY, raw.slice(0, 512));
  } catch {
    /* ignore */
  }
}

export function peekPostInstallPath(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(POST_INSTALL_PATH_KEY);
  } catch {
    return null;
  }
}

export function consumePostInstallPath(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = localStorage.getItem(POST_INSTALL_PATH_KEY);
    if (!v) return null;
    localStorage.removeItem(POST_INSTALL_PATH_KEY);
    return v;
  } catch {
    return null;
  }
}

/** 给将要复制/打开的链接加上 fw=1 */
export function withFromWechatParam(url: string): string {
  try {
    const u = new URL(
      url,
      typeof window !== 'undefined' ? window.location.origin : 'https://2sc.prestoai.cn',
    );
    u.searchParams.set(FROM_WECHAT_PARAM, '1');
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * 强化逃逸关键：把当前地址带上 fw=1（不刷新）。
 * 微信「··· → 在浏览器打开」用的是当前 URL，带上后系统浏览器落地可直接强化安装。
 */
export function primeCurrentUrlForWechatEscape(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const u = new URL(window.location.href);
    const fw = u.searchParams.get(FROM_WECHAT_PARAM);
    if (fw !== '1' && fw !== 'true') {
      u.searchParams.set(FROM_WECHAT_PARAM, '1');
      window.history.replaceState(
        window.history.state,
        '',
        `${u.pathname}${u.search}${u.hash}`,
      );
    }
    markWechatEscapeIntent();
    notePostInstallPath();
    return true;
  } catch {
    markWechatEscapeIntent();
    return false;
  }
}

/**
 * 落地时解析 fw=1：标记逃逸意图，并提示调用方去掉 query、强化安装。
 */
export function bootstrapFromWechatParam(search: URLSearchParams | { get: (k: string) => string | null }): {
  stripQuery: boolean;
  shouldBoostInstall: boolean;
} {
  const fw = search.get(FROM_WECHAT_PARAM);
  if (fw !== '1' && fw !== 'true') {
    return {
      stripQuery: false,
      shouldBoostInstall: hasWechatEscapeIntent(),
    };
  }
  markWechatEscapeIntent();
  notePostInstallPath();
  return { stripQuery: true, shouldBoostInstall: true };
}
