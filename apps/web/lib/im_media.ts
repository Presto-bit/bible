import { contentAssetUrl } from '@/lib/api';
import { detectImMediaKind } from '@/lib/im_av';

/** 从消息附件中取出可预览的图片 URL 列表。 */
export function collectMessageImages(
  attachments:
    | Array<{ id?: string; url?: string | null; mime?: string | null; file_name?: string | null }>
    | null
    | undefined,
  kind?: string | null,
): { src: string; alt?: string }[] {
  if (!attachments?.length) return [];
  const out: { src: string; alt?: string }[] = [];
  for (const a of attachments) {
    if (!a.url) continue;
    if (detectImMediaKind(a.mime, a.file_name, kind) !== 'image') continue;
    out.push({ src: contentAssetUrl(a.url), alt: a.file_name || '图片' });
  }
  return out;
}

export async function downloadImAsset(url: string, fileName?: string | null) {
  try {
    const { downloadViaAndroidShell } = await import('./android_shell_bridge');
    if (downloadViaAndroidShell(url, fileName || undefined)) {
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = fileName || 'image.jpg';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
    return true;
  } catch {
    try {
      const { openViaAndroidShellExternal } = await import('./android_shell_bridge');
      if (openViaAndroidShellExternal(url)) return false;
    } catch {
      /* ignore */
    }
    window.open(url, '_blank', 'noopener,noreferrer');
    return false;
  }
}
