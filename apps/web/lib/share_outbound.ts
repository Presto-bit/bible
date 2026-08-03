/** PWA 出站分享契约：系统分享 → 失败只复制；取消不下载 */

import {
  hasAndroidShellShare,
  shareViaAndroidShell,
} from './android_shell_bridge';
import { isPeiaiAndroidShell } from './pwa_platform';

export type ShareOutboundResult =
  | 'shared'
  | 'copied'
  | 'cancelled'
  | 'downloaded'
  | 'failed';

export function isShareAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; message?: string };
  if (e.name === 'AbortError' || e.name === 'NotAllowedError') return true;
  const msg = (e.message || '').toLowerCase();
  return (
    msg.includes('abort')
    || msg.includes('cancel')
    || msg.includes('share canceled')
    || msg.includes('share cancelled')
  );
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

type ShareNav = Navigator & {
  share?: (d: {
    files?: File[];
    title?: string;
    text?: string;
    url?: string;
  }) => Promise<void>;
  canShare?: (d: {
    files?: File[];
    title?: string;
    text?: string;
    url?: string;
  }) => boolean;
};

async function fileToDataUrl(file: File): Promise<string | null> {
  try {
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  } catch {
    return null;
  }
}

/**
 * 统一出站：
 * 0) 安卓壳 → 优先原生系统分享面板（含图）
 * 1) 有图且可分享文件 → 系统分享（图+文）
 * 2) 否则文字+链接系统分享
 * 3) 用户取消 → cancelled（不下图、不复制）
 * 4) 无 Share API → 复制文+链；仅当 allowDownload 且有 blob 时才下载图
 */
export async function shareOutbound(opts: {
  title: string;
  text: string;
  url: string;
  file?: File | null;
  /** 无系统分享时是否允许下载图片（默认 false：只复制） */
  allowDownload?: boolean;
}): Promise<ShareOutboundResult> {
  const title = (opts.title || '').trim();
  const text = (opts.text || '').trim();
  const url = (opts.url || '').trim();
  const clipboard = url ? `${text}\n${url}`.trim() : text;
  const nav = navigator as ShareNav;
  const file = opts.file || null;

  // 安卓独立壳：系统分享面板为主路径
  if (isPeiaiAndroidShell() && hasAndroidShellShare()) {
    let imageDataUrl = '';
    if (file && file.type.startsWith('image/')) {
      imageDataUrl = (await fileToDataUrl(file)) || '';
    }
    if (
      shareViaAndroidShell({
        title,
        text,
        url,
        imageDataUrl: imageDataUrl || undefined,
      })
    ) {
      return 'shared';
    }
  }

  if (nav.share) {
    if (file) {
      const canFiles =
        typeof nav.canShare !== 'function' || nav.canShare({ files: [file] });
      if (canFiles) {
        try {
          await nav.share({
            files: [file],
            title,
            text: url ? `${text}\n${url}` : text,
          });
          return 'shared';
        } catch (err) {
          if (isShareAbortError(err)) return 'cancelled';
          /* fallthrough to text share */
        }
      }
    }

    try {
      await nav.share({
        title,
        text,
        url: url || undefined,
      });
      return 'shared';
    } catch (err) {
      if (isShareAbortError(err)) return 'cancelled';
      /* fallthrough to copy */
    }
  }

  if (clipboard && (await copyText(clipboard))) return 'copied';

  if (opts.allowDownload && file) {
    try {
      const objectUrl = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = file.name || 'share.png';
      a.click();
      URL.revokeObjectURL(objectUrl);
      return 'downloaded';
    } catch {
      return 'failed';
    }
  }

  return clipboard ? 'failed' : 'failed';
}
