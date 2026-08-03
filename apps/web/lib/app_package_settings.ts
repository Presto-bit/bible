/** 设置 → 彼爱安装包：常驻入口的文案与动作 */

import { BASE_PATH } from '@/lib/basePath';
import {
  androidTwaApkUrl,
  androidTwaMetaUrl,
  type AndroidTwaMeta,
} from '@/lib/android_twa';
import {
  detectInstallPlatform,
  isPeiaiAndroidShell,
  type InstallPlatform,
} from '@/lib/pwa_platform';

export type AppPackageAction =
  | 'install_sheet'
  | 'download_apk'
  | 'noop';

export type AppPackageRow = {
  title: string;
  hint: string;
  action: AppPackageAction;
  /** 官网最新 versionName（有 meta 时） */
  latestVersion?: string;
  /** 壳内本地 versionName */
  shellVersion?: string;
  updateAvailable?: boolean;
};

export async function fetchAndroidPackageMeta(): Promise<AndroidTwaMeta | null> {
  if (typeof window === 'undefined') return null;
  try {
    const res = await fetch(androidTwaMetaUrl(BASE_PATH || ''), {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as AndroidTwaMeta;
    if (!data?.versionName) return null;
    return data;
  } catch {
    return null;
  }
}

/** 从 UA 解析 PeiaiAndroidShell/1.0.1 */
export function parseAndroidShellVersionName(ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''): string | null {
  const m = ua.match(/PeiaiAndroidShell\/([0-9A-Za-z.+-]+)/i);
  return m?.[1] || null;
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

export function resolveAppPackageRow(opts?: {
  platform?: InstallPlatform;
  meta?: AndroidTwaMeta | null;
  shellVersion?: string | null;
}): AppPackageRow {
  const platform = opts?.platform ?? detectInstallPlatform();
  const meta = opts?.meta ?? null;
  const shellFromUa = opts?.shellVersion !== undefined
    ? opts.shellVersion
    : isPeiaiAndroidShell()
      ? parseAndroidShellVersionName()
      : null;
  const shellVersion = shellFromUa || undefined;
  const latest = meta?.versionName?.trim() || undefined;
  const latestLabel = latest ? `官网 ${latest}` : '官网安装包';

  // 安卓 WebView 壳
  if (isPeiaiAndroidShell() || shellVersion) {
    const updateAvailable = Boolean(
      latest && shellVersion && isPackageVersionNewer(latest, shellVersion),
    );
    if (updateAvailable) {
      return {
        title: '更新安装包',
        hint: `当前 ${shellVersion} → 可升到 ${latest}`,
        action: 'download_apk',
        latestVersion: latest,
        shellVersion,
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
      updateAvailable: false,
    };
  }

  if (platform === 'standalone') {
    return {
      title: '应用形态',
      hint: '已从主屏幕 / 桌面打开',
      action: 'noop',
      latestVersion: latest,
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
  return androidTwaApkUrl(BASE_PATH || '');
}
