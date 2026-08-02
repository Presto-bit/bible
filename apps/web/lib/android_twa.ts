/** 彼爱 Android TWA 直装（不跳应用商店） */

export const ANDROID_TWA_PACKAGE_ID = 'cn.prestoai.peiai';

/** 同域 APK */
export const ANDROID_TWA_APK_PATH = '/downloads/peiai-android.apk';

/** 版本元数据 */
export const ANDROID_TWA_META_PATH = '/downloads/peiai-android.json';

export type AndroidTwaMeta = {
  packageId: string;
  versionCode: number;
  versionName: string;
  bytes: number;
  sha256: string;
  downloadUrl: string;
  certSha256?: string;
};

export function androidTwaApkUrl(basePath = ''): string {
  const root = (basePath || '').replace(/\/$/, '');
  return `${root}${ANDROID_TWA_APK_PATH}`;
}

export function androidTwaMetaUrl(basePath = ''): string {
  const root = (basePath || '').replace(/\/$/, '');
  return `${root}${ANDROID_TWA_META_PATH}`;
}

/** 尝试检测是否已安装 TWA（需 related_applications + asset links） */
export async function detectAndroidTwaInstalled(): Promise<boolean> {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & {
    getInstalledRelatedApps?: () => Promise<Array<{ id?: string; platform?: string }>>;
  };
  if (typeof nav.getInstalledRelatedApps !== 'function') return false;
  try {
    const apps = await nav.getInstalledRelatedApps();
    return apps.some(
      (a) =>
        a.platform === 'play' ||
        a.id === ANDROID_TWA_PACKAGE_ID ||
        (a as { url?: string }).url?.includes(ANDROID_TWA_PACKAGE_ID),
    );
  } catch {
    return false;
  }
}
