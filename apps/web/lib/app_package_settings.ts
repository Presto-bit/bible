/** 设置 → 彼爱安装包：常驻入口的文案与动作 */

import { BASE_PATH } from '@/lib/basePath';
import {
  androidTwaApkUrl,
  androidTwaMetaUrl,
  type AndroidTwaMeta,
} from '@/lib/android_twa';
import { getPeiaiFlutterH5Version, isPeiaiFlutterH5Host } from '@/lib/android_host';
import {
  detectInstallPlatform,
  isAndroid,
  isPeiaiAndroidShell,
  type InstallPlatform,
} from '@/lib/pwa_platform';

export type AppPackageAction =
  | 'install_sheet'
  | 'download_apk'
  | 'flutter_update'
  | 'noop';

export type AppPackageRow = {
  title: string;
  hint: string;
  action: AppPackageAction;
  /** 官网最新 versionName（有 meta 时） */
  latestVersion?: string;
  /** 壳内本地 versionName */
  shellVersion?: string;
  /** 官网 versionCode */
  latestVersionCode?: number;
  /** 壳内 versionCode（桥或 UA） */
  shellVersionCode?: number;
  updateAvailable?: boolean;
};

export async function fetchAndroidPackageMeta(): Promise<AndroidTwaMeta | null> {
  if (typeof window === 'undefined') return null;
  try {
    // cache-bust：绕过 SW 曾 cache-first 的旧 json（与 Cache-Control no-store 双保险）
    const base = androidTwaMetaUrl(BASE_PATH || '');
    const url = `${base}${base.includes('?') ? '&' : '?'}_=${Date.now()}`;
    const res = await fetch(url, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as AndroidTwaMeta;
    if (!data?.versionName) return null;
    return data;
  } catch {
    return null;
  }
}

export type AndroidShellLocalVersion = {
  versionName: string | null;
  versionCode: number | null;
};

/**
 * 解析安装包版本：优先 Chrome Host 持久化标记，其次旧 WebView UA。
 * 旧格式：`PeiaiAndroidShell/1.0.9 (vc10)`。
 */
export function parseAndroidShellVersion(
  ua = typeof navigator !== 'undefined' ? navigator.userAgent : '',
): AndroidShellLocalVersion {
  try {
    // 避免循环依赖：动态读 localStorage 键（与 android_host 一致）
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem('peiai_android_host_v1');
      if (raw) {
        const data = JSON.parse(raw) as {
          versionName?: string;
          versionCode?: number;
        };
        if (data?.versionName) {
          return {
            versionName: data.versionName,
            versionCode:
              typeof data.versionCode === 'number' && data.versionCode > 0
                ? data.versionCode
                : null,
          };
        }
      }
    }
  } catch {
    /* fall through */
  }
  const m = ua.match(/PeiaiAndroidShell\/([0-9A-Za-z.+-]+)(?:\s*\(vc(\d+)\))?/i);
  if (!m) return { versionName: null, versionCode: null };
  const code = m[2] ? parseInt(m[2], 10) : NaN;
  return {
    versionName: m[1] || null,
    versionCode: Number.isFinite(code) ? code : null,
  };
}

/** @deprecated 使用 parseAndroidShellVersion().versionName */
export function parseAndroidShellVersionName(
  ua = typeof navigator !== 'undefined' ? navigator.userAgent : '',
): string | null {
  return parseAndroidShellVersion(ua).versionName;
}

function versionParts(v: string): number[] {
  return v
    .split(/[.+-]/)
    .map((p) => parseInt(p, 10))
    .map((n) => (Number.isFinite(n) ? n : 0));
}

/** remote 是否比 local 新（按点分段数字，长度不等用 0 补） */
export function isPackageVersionNewer(remote: string, local: string): boolean {
  const a = versionParts(remote.trim());
  const b = versionParts(local.trim());
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

/**
 * 是否有新壳可更新。优先 versionCode（只 bump code 也能发现）；
 * 无 code 时回退 versionName 比较。
 */
export function isAndroidShellUpdateAvailable(opts: {
  latestName?: string | null;
  latestCode?: number | null;
  localName?: string | null;
  localCode?: number | null;
}): boolean {
  const latestCode = opts.latestCode;
  const localCode = opts.localCode;
  if (
    typeof latestCode === 'number'
    && Number.isFinite(latestCode)
    && typeof localCode === 'number'
    && Number.isFinite(localCode)
  ) {
    return latestCode > localCode;
  }
  const latest = (opts.latestName || '').trim();
  const local = (opts.localName || '').trim();
  if (!latest || !local) return false;
  return isPackageVersionNewer(latest, local);
}

export function resolveAppPackageRow(opts?: {
  platform?: InstallPlatform;
  meta?: AndroidTwaMeta | null;
  shellVersion?: string | null;
  shellVersionCode?: number | null;
}): AppPackageRow {
  const platform = opts?.platform ?? detectInstallPlatform();
  const meta = opts?.meta ?? null;
  const parsed = isPeiaiAndroidShell() ? parseAndroidShellVersion() : { versionName: null, versionCode: null };
  const shellFromUa = opts?.shellVersion !== undefined
    ? opts.shellVersion
    : parsed.versionName;
  const shellVersion = shellFromUa || undefined;
  const shellVersionCode = opts?.shellVersionCode !== undefined
    ? opts.shellVersionCode ?? undefined
    : parsed.versionCode ?? undefined;
  const latest = meta?.versionName?.trim() || undefined;
  const latestCode = typeof meta?.versionCode === 'number' ? meta.versionCode : undefined;
  const latestLabel = latest ? `官网 ${latest}` : '官网安装包';

  // Flutter 原生 App 内嵌 H5：不可再提示「下载彼爱 App」；
  // 显示当前 APK 与官网版本，并交原生通道执行更新。
  if (isPeiaiFlutterH5Host()) {
    const local = getPeiaiFlutterH5Version();
    const updateAvailable = isAndroidShellUpdateAvailable({
      latestName: latest,
      latestCode,
      localName: local.versionName,
      localCode: local.versionCode,
    });
    const current = local.versionName
      ? `当前 ${local.versionName}${local.versionCode != null ? ` (${local.versionCode})` : ''}`
      : '当前版本';
    return {
      title: updateAvailable ? '更新彼爱 App' : '彼爱 App',
      hint: updateAvailable
        ? `${current} · 可更新至 ${latest || '?'}${latestCode != null ? ` (${latestCode})` : ''}`
        : latest
          ? `${current} · 已是最新版本`
          : `${current} · 暂无法检查更新`,
      action: 'flutter_update',
      latestVersion: latest,
      shellVersion: local.versionName ?? undefined,
      latestVersionCode: latestCode,
      shellVersionCode: local.versionCode ?? undefined,
      updateAvailable,
    };
  }

  // 安卓 WebView 壳
  if (isPeiaiAndroidShell() || shellVersion) {
    const updateAvailable = isAndroidShellUpdateAvailable({
      latestName: latest,
      latestCode,
      localName: shellVersion,
      localCode: shellVersionCode ?? null,
    });
    if (updateAvailable) {
      return {
        title: '更新安装包',
        hint: `当前 ${shellVersion || '?'}${shellVersionCode != null ? ` (${shellVersionCode})` : ''} → 可升到 ${latest || '?'}${latestCode != null ? ` (${latestCode})` : ''}`,
        action: 'download_apk',
        latestVersion: latest,
        shellVersion,
        latestVersionCode: latestCode,
        shellVersionCode,
        updateAvailable: true,
      };
    }
    return {
      title: '彼爱安装包',
      hint: shellVersion
        ? `已是 ${shellVersion}${latest && latest !== shellVersion ? ` · 官网 ${latest}` : ' · 可重新下载'}`
        : `${latestLabel} · 可重新下载`,
      action: 'download_apk',
      latestVersion: latest,
      shellVersion,
      latestVersionCode: latestCode,
      shellVersionCode,
      updateAvailable: false,
    };
  }

  if (platform === 'standalone') {
    // 安卓若只是「添加到主屏幕」的 PWA，仍引导安装真正的 App 包
    if (isAndroid() && !isPeiaiAndroidShell()) {
      return {
        title: '下载彼爱 App',
        hint: latest
          ? `推荐安装包 ${latest}（比主屏幕快捷方式更稳）`
          : '推荐安装包，比主屏幕快捷方式更稳',
        action: 'download_apk',
        latestVersion: latest,
      };
    }
    return {
      title: '应用形态',
      hint: isPeiaiAndroidShell()
        ? `已安装彼爱 App${shellVersion ? ` · ${shellVersion}` : ''}`
        : '已从主屏幕打开',
      action: 'noop',
      latestVersion: latest,
      shellVersion,
    };
  }

  if (platform === 'inapp') {
    return {
      title: '安装彼爱',
      hint: '微信内无法直接安装 · 先用浏览器打开',
      action: 'install_sheet',
      latestVersion: latest,
    };
  }

  if (platform === 'ios-safari' || platform === 'ios-other') {
    return {
      title: '保存到主屏幕',
      hint: 'Safari · 约 10 秒 · 像 App 一样打开',
      action: 'install_sheet',
      latestVersion: latest,
    };
  }

  if (platform === 'desktop') {
    return {
      title: '保存到桌面 App',
      hint: 'Chrome / Edge 安装浏览器桌面版',
      action: 'install_sheet',
      latestVersion: latest,
    };
  }

  // 安卓系统浏览器
  if (platform === 'android-chrome' || platform === 'android-other') {
    return {
      title: '下载彼爱 App',
      hint: latest ? `官网安装包 ${latest} · 不跳商店` : '官网安装包 · 不跳商店',
      action: 'download_apk',
      latestVersion: latest,
      updateAvailable: false,
    };
  }

  return {
    title: '彼爱安装包',
    hint: latestLabel,
    action: 'install_sheet',
    latestVersion: latest,
  };
}

export function androidPackageDownloadHref(): string {
  const base = androidTwaApkUrl(BASE_PATH || '');
  // 避免中间层长期缓存旧 APK
  return `${base}${base.includes('?') ? '&' : '?'}v=${Date.now()}`;
}
