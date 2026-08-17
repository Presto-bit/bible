/**
 * Web 识别 Flutter 壳嵌 H5：注入 token、标记 client、原生桥。
 * 由 apps/mobile H5 容器 load 后 runJavaScript 写入 session。
 */
export const FLUTTER_H5_QUERY = {
  host: 'peiai_flutter',
  token: 'peiai_ft_token',
} as const;

export const SESSION_TOKEN_KEY = 'presto_session_token';

type PeiaiNativePayload =
  | { type: 'open_assistant'; ref?: string; q?: string; question?: string }
  | { type: 'open_reader'; book?: string; chapter?: string | number }
  | { type: 'open_path'; path: string }
  | { type: 'open_external'; url: string; title?: string }
  | { type: 'check_app_update' }
  | { type: 'close_h5' }
  | { type: 'go_back' }
  | { type: 'open_offline_download' }
  | { type: 'request_notifications' }
  | {
      type: 'show_im_notification';
      title?: string;
      body: string;
      path?: string;
      openPath?: string;
      tag?: string;
    }
  | {
      type: 'schedule_reminder';
      kind?: 'daily' | 'group' | string;
      enabled?: boolean | number;
      hour?: number;
      minute?: number;
      title?: string;
      body?: string;
      path?: string;
      openPath?: string;
    }
  | { type: 'cancel_reminder'; kind?: 'daily' | 'group' | string };

declare global {
  interface Window {
    PeiaiFlutter?: { postMessage: (msg: string) => void };
    __PEIAI_FLUTTER__?: {
      client: string;
      theme?: string;
      /** Flutter 壳当前主 Tab：home|bible|assistant|discover|profile */
      hostTab?: string;
      openNative: (payload: PeiaiNativePayload | string) => void;
    };
  }
}

/** 挂上与 iOS standalone 同级的 chrome 类（无 Web 五 Tab）。 */
export function markFlutterH5Chrome(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const body = document.body;
  root.classList.add('android-flutter-h5', 'pwa-standalone');
  body?.classList.add('android-flutter-h5', 'pwa-standalone');
  try {
    sessionStorage.setItem('peiai_client_kind', 'android_h5_tab');
  } catch {
    /* ignore */
  }
  // 系统返回：Flutter 先调此函数关半屏（§24.6）
  try {
    // 动态 import 避免循环；失败则点 backdrop
    void import('@/lib/sheet_overlay').then((m) => {
      (window as Window & { __PEIAI_DISMISS_OVERLAYS__?: () => void })
        .__PEIAI_DISMISS_OVERLAYS__ = () => {
          try {
            m.dismissPortaledOverlays();
            m.dismissOrphanBodySheetBackdrops();
          } catch {
            /* ignore */
          }
        };
    }).catch(() => {
      (window as Window & { __PEIAI_DISMISS_OVERLAYS__?: () => void })
        .__PEIAI_DISMISS_OVERLAYS__ = () => {
          try {
            document.querySelectorAll(
              '.sheet-backdrop, .reader-sheet-backdrop',
            ).forEach((el) => {
              try {
                (el as HTMLElement).click();
              } catch {
                /* ignore */
              }
            });
          } catch {
            /* ignore */
          }
        };
    });
  } catch {
    /* ignore */
  }
}

/** 从 URL query 应用主题 / 安全区（首帧、JS bridge 未跑到之前）。 */
function applyFlutterQueryChrome(sp: URLSearchParams): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const theme = (sp.get('peiai_theme') || '').trim();
  if (theme) {
    const dark = theme === 'dark';
    root.setAttribute('data-peiai-theme', dark ? 'dark' : 'light');
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    root.setAttribute('data-app-theme', theme);
  }
  const insetTop = parseInt(sp.get('peiai_inset_top') || '', 10);
  if (Number.isFinite(insetTop) && insetTop >= 0) {
    root.style.setProperty('--shell-inset-top', `${insetTop}px`);
  }
}

/**
 * 若 URL 带 Flutter 注入 token，写入 localStorage 并清理 query（客户端一次）。
 * 亦从 session / UA 恢复标记（SPA 内导航后 query 已剥）。
 */
export function captureFlutterH5AuthFromUrl(): void {
  if (typeof window === 'undefined') return;
  try {
    const sp = new URLSearchParams(window.location.search);
    const isFlutter = sp.get(FLUTTER_H5_QUERY.host) === '1';
    const token = (sp.get(FLUTTER_H5_QUERY.token) || '').trim();
    const fromUa = /\bPeiaiFlutter\b/i.test(navigator.userAgent || '');
    let fromSession = false;
    try {
      fromSession = sessionStorage.getItem('peiai_client_kind') === 'android_h5_tab';
    } catch {
      /* ignore */
    }

    if (token) {
      localStorage.setItem(SESSION_TOKEN_KEY, token);
    }
    if (isFlutter || fromUa || fromSession) {
      markFlutterH5Chrome();
      if (isFlutter) applyFlutterQueryChrome(sp);
    }

    if (token || isFlutter) {
      const url = new URL(window.location.href);
      url.searchParams.delete(FLUTTER_H5_QUERY.host);
      url.searchParams.delete(FLUTTER_H5_QUERY.token);
      url.searchParams.delete('peiai_theme');
      url.searchParams.delete('peiai_inset_top');
      const next =
        url.pathname
        + (url.searchParams.toString() ? `?${url.searchParams}` : '')
        + url.hash;
      window.history.replaceState(window.history.state, '', next);
    }
  } catch {
    /* ignore */
  }
}

/** 是否运行在 Flutter 嵌 H5 */
export function isFlutterH5Host(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (sessionStorage.getItem('peiai_client_kind') === 'android_h5_tab') return true;
  } catch {
    /* ignore */
  }
  if (document.documentElement.classList.contains('android-flutter-h5')) return true;
  try {
    return /\bPeiaiFlutter\b/i.test(navigator.userAgent || '');
  } catch {
    return false;
  }
}

/**
 * 请求 Flutter 原生打开小爱（带经节锚点）。非 Flutter H5 时返回 false。
 */
export function peiaiOpenNativeAssistant(opts: {
  ref?: string;
  q?: string;
}): boolean {
  return peiaiOpenNative({
    type: 'open_assistant',
    ref: opts.ref,
    q: opts.q,
  });
}

export function peiaiOpenNative(payload: PeiaiNativePayload): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const fn = window.__PEIAI_FLUTTER__?.openNative;
    if (typeof fn === 'function') {
      fn(payload);
      return true;
    }
    if (window.PeiaiFlutter?.postMessage) {
      window.PeiaiFlutter.postMessage(JSON.stringify(payload));
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export const APP_UPDATE_EVENT = 'peiai-app-update';

export type AppUpdateSnapshot = {
  phase: 'idle' | 'downloading' | 'prompting' | 'ready' | 'failed' | string;
  progress: number;
  error?: string | null;
  versionCode?: number | null;
  versionName?: string | null;
};

declare global {
  interface Window {
    __PEIAI_APP_UPDATE__?: AppUpdateSnapshot;
  }
}

export function readAppUpdateSnapshot(): AppUpdateSnapshot | null {
  if (typeof window === 'undefined') return null;
  const snap = window.__PEIAI_APP_UPDATE__;
  if (!snap || typeof snap !== 'object') return null;
  return snap;
}

export function subscribeAppUpdate(
  listener: (snap: AppUpdateSnapshot) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  const onEvent = (ev: Event) => {
    const detail = (ev as CustomEvent<AppUpdateSnapshot>).detail;
    if (detail) listener(detail);
  };
  window.addEventListener(APP_UPDATE_EVENT, onEvent);
  const existing = readAppUpdateSnapshot();
  if (existing) {
    try {
      listener(existing);
    } catch {
      /* ignore */
    }
  }
  return () => window.removeEventListener(APP_UPDATE_EVENT, onEvent);
}
