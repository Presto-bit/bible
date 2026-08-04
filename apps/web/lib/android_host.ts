/**
 * 安卓安装包宿主探测（Chrome-hosted 2.0+ / 旧 WebView 壳）。
 * 能力探测优先于 UA；交互路径应走 standalone，勿再为 WebView 特判点击模型。
 */

const STORAGE_KEY = 'peiai_android_host_v1';

export type AndroidHostRuntime = 'chrome' | 'webview-legacy';

export type AndroidHostInfo = {
  runtime: AndroidHostRuntime;
  versionName: string;
  versionCode: number;
  /** 首次写入时间 */
  capturedAt: number;
};

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

export function readAndroidHostInfo(): AndroidHostInfo | null {
  if (!canUseStorage()) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as AndroidHostInfo;
    if (!data?.runtime || !data.versionName) return null;
    return data;
  } catch {
    return null;
  }
}

export function writeAndroidHostInfo(info: AndroidHostInfo): void {
  if (!canUseStorage()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(info));
  } catch {
    /* ignore */
  }
}

/** 旧 System WebView 壳（PeiaiAndroidShell UA） */
export function isPeiaiAndroidWebViewShell(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /PeiaiAndroidShell\//i.test(navigator.userAgent);
}

/** Chrome-hosted 官网包（query 标记或已持久化） */
export function isPeiaiAndroidChromeHost(): boolean {
  const info = readAndroidHostInfo();
  if (info?.runtime === 'chrome') return true;
  if (typeof window === 'undefined') return false;
  try {
    const sp = new URLSearchParams(window.location.search);
    return sp.get('peiai_host') === 'chrome';
  } catch {
    return false;
  }
}

/**
 * 是否具备安卓安装包能力宿主（提醒 / 通知设置 / APK 更新）。
 * 含 Chrome Host 2.0+ 与旧 WebView 壳。
 */
export function isPeiaiAndroidCapabilityHost(): boolean {
  return isPeiaiAndroidChromeHost() || isPeiaiAndroidWebViewShell();
}

/**
 * @deprecated 语义已扩大为「能力宿主」；新代码请用 isPeiaiAndroidCapabilityHost /
 * isPeiaiAndroidChromeHost / isPeiaiAndroidWebViewShell。
 */
export function isPeiaiAndroidShell(): boolean {
  return isPeiaiAndroidCapabilityHost();
}

export function getAndroidHostVersion(): {
  versionName: string | null;
  versionCode: number | null;
  runtime: AndroidHostRuntime | null;
} {
  const info = readAndroidHostInfo();
  if (info) {
    return {
      versionName: info.versionName,
      versionCode: info.versionCode,
      runtime: info.runtime,
    };
  }
  if (isPeiaiAndroidWebViewShell()) {
    const m = navigator.userAgent.match(
      /PeiaiAndroidShell\/([0-9A-Za-z.+-]+)(?:\s*\(vc(\d+)\))?/i,
    );
    if (!m) {
      return { versionName: null, versionCode: null, runtime: 'webview-legacy' };
    }
    const code = m[2] ? parseInt(m[2], 10) : NaN;
    return {
      versionName: m[1] || null,
      versionCode: Number.isFinite(code) ? code : null,
      runtime: 'webview-legacy',
    };
  }
  return { versionName: null, versionCode: null, runtime: null };
}

/**
 * 从启动 URL 捕获 Chrome Host 标记，写入 localStorage，并清理地址栏 query（不刷新）。
 * 应在客户端尽早调用一次。
 */
export function captureAndroidHostFromUrl(): AndroidHostInfo | null {
  if (typeof window === 'undefined') return null;

  // 旧 WebView 壳：从 UA 持久化，便于统一读版本
  if (isPeiaiAndroidWebViewShell()) {
    const m = navigator.userAgent.match(
      /PeiaiAndroidShell\/([0-9A-Za-z.+-]+)(?:\s*\(vc(\d+)\))?/i,
    );
    const info: AndroidHostInfo = {
      runtime: 'webview-legacy',
      versionName: m?.[1] || '1.0.0',
      versionCode: m?.[2] ? parseInt(m[2], 10) : 0,
      capturedAt: Date.now(),
    };
    writeAndroidHostInfo(info);
    return info;
  }

  let sp: URLSearchParams;
  try {
    sp = new URLSearchParams(window.location.search);
  } catch {
    return readAndroidHostInfo();
  }

  const host = sp.get('peiai_host');
  if (host !== 'chrome') {
    return readAndroidHostInfo();
  }

  const versionName = (sp.get('peiai_vn') || '').trim() || '2.0.0';
  const vcRaw = parseInt(sp.get('peiai_vc') || '', 10);
  const versionCode = Number.isFinite(vcRaw) && vcRaw > 0 ? vcRaw : 20;
  const info: AndroidHostInfo = {
    runtime: 'chrome',
    versionName,
    versionCode,
    capturedAt: Date.now(),
  };
  writeAndroidHostInfo(info);

  // 清理 peiai_* query，避免污染分享链接 / 路由
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('peiai_host');
    url.searchParams.delete('peiai_vn');
    url.searchParams.delete('peiai_vc');
    const next = url.pathname + (url.searchParams.toString() ? `?${url.searchParams}` : '') + url.hash;
    window.history.replaceState(window.history.state, '', next);
  } catch {
    /* ignore */
  }

  return info;
}

/** 通过 peiai:// 调用最小能力宿主（Chrome Host）；瞬时 iframe，不离开当前页 */
export function invokeAndroidCapability(pathAndQuery: string): boolean {
  if (typeof window === 'undefined') return false;
  const info = readAndroidHostInfo();
  const isChrome =
    info?.runtime === 'chrome'
    || (() => {
      try {
        return new URLSearchParams(window.location.search).get('peiai_host') === 'chrome';
      } catch {
        return false;
      }
    })();
  if (!isChrome) return false;

  const path = pathAndQuery.startsWith('/') ? pathAndQuery.slice(1) : pathAndQuery;
  const href = `peiai://host/${path}`;
  try {
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'display:none;width:0;height:0;border:0;position:absolute';
    iframe.setAttribute('aria-hidden', 'true');
    iframe.src = href;
    document.documentElement.appendChild(iframe);
    window.setTimeout(() => {
      try {
        iframe.remove();
      } catch {
        /* ignore */
      }
    }, 1_500);
    return true;
  } catch {
    try {
      window.location.href = href;
      return true;
    } catch {
      return false;
    }
  }
}
