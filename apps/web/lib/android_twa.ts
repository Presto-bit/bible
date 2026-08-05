/** 彼爱 Android 官网安装包（主推 Flutter；历史曾 Chrome Host / WebView 壳） */

export const ANDROID_TWA_PACKAGE_ID = 'cn.prestoai.peiai';

/** 同域 APK */
export const ANDROID_TWA_APK_PATH = '/downloads/biai-android.apk';

/** 版本元数据 */
export const ANDROID_TWA_META_PATH = '/downloads/biai-android.json';

export type AndroidTwaMeta = {
  packageId: string;
  versionCode: number;
  versionName: string;
  bytes: number;
  sha256: string;
  downloadUrl: string;
  certSha256?: string;
  /** 安装包配套图标（站点 /downloads） */
  iconUrl?: string;
  icon192Url?: string;
  /**
   * flutter = Flutter 主包；
   * chrome-twa = Chrome Host 实验；
   * webview-shell = 历史整站 WebView；
   * 缺省视为历史包
   */
  runtime?: string;
  generatorApp?: string;
};

export function androidTwaApkUrl(basePath = ''): string {
  const root = (basePath || '').replace(/\/$/, '');
  return `${root}${ANDROID_TWA_APK_PATH}`;
}

export function androidTwaMetaUrl(basePath = ''): string {
  const root = (basePath || '').replace(/\/$/, '');
  return `${root}${ANDROID_TWA_META_PATH}`;
}

/**
 * 尝试检测是否已安装 TWA。
 * 直装 APK 多数机型 getInstalledRelatedApps 不可用；成功时返回 true。
 */
export async function detectAndroidTwaInstalled(): Promise<boolean> {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & {
    getInstalledRelatedApps?: () => Promise<
      Array<{ id?: string; platform?: string; url?: string }>
    >;
  };
  if (typeof nav.getInstalledRelatedApps !== 'function') return false;
  try {
    const apps = await nav.getInstalledRelatedApps();
    return apps.some((a) => {
      const id = (a.id || '').toLowerCase();
      const url = (a.url || '').toLowerCase();
      return (
        id === ANDROID_TWA_PACKAGE_ID
        || id.includes(ANDROID_TWA_PACKAGE_ID)
        || url.includes(ANDROID_TWA_PACKAGE_ID)
        || url.includes('biai-android.apk')
        || url.includes('peiai-android.apk')
      );
    });
  } catch {
    return false;
  }
}
