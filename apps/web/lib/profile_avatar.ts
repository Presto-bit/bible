/** 自定义头像：预设 id 仍为 a1–a50；上传后 avatar_id = `u:<url>` */

import { contentAssetUrl } from '@/lib/api';
import { userLsGet, userLsRemove, userLsSet } from '@/lib/user_storage';

export const CUSTOM_AVATAR_PREFIX = 'u:';
/** 本机缓存压缩后的 data URL，弱网/闪现用 */
export const AVATAR_CUSTOM_CACHE_KEY = 'profile_avatar_custom_cache';

export function isCustomAvatarId(id: string | null | undefined): boolean {
  if (!id) return false;
  return (
    id.startsWith(CUSTOM_AVATAR_PREFIX)
    || id.startsWith('http://')
    || id.startsWith('https://')
    || id.startsWith('data:')
  );
}

/** 解析可给 <img src> 用的地址 */
export function customAvatarSrc(id: string): string {
  if (id.startsWith('http://') || id.startsWith('https://') || id.startsWith('data:')) {
    return id;
  }
  if (id.startsWith(CUSTOM_AVATAR_PREFIX)) {
    const rest = id.slice(CUSTOM_AVATAR_PREFIX.length);
    if (rest.startsWith('http://') || rest.startsWith('https://') || rest.startsWith('data:')) {
      return rest;
    }
    return contentAssetUrl(rest.startsWith('/') ? rest : `/${rest}`);
  }
  return id;
}

export function encodeCustomAvatarId(url: string): string {
  const u = url.trim();
  if (!u) return '';
  if (u.startsWith(CUSTOM_AVATAR_PREFIX)) return u;
  return `${CUSTOM_AVATAR_PREFIX}${u}`;
}

export function getCachedCustomAvatar(): string | null {
  if (typeof window === 'undefined') return null;
  const v = userLsGet(AVATAR_CUSTOM_CACHE_KEY);
  return v && v.startsWith('data:') ? v : null;
}

export function setCachedCustomAvatar(dataUrl: string | null) {
  if (typeof window === 'undefined') return;
  if (!dataUrl) {
    userLsRemove(AVATAR_CUSTOM_CACHE_KEY);
    return;
  }
  // 控制体积：过大则不缓存（仍靠远端 url）
  if (dataUrl.length > 180_000) {
    userLsRemove(AVATAR_CUSTOM_CACHE_KEY);
    return;
  }
  userLsSet(AVATAR_CUSTOM_CACHE_KEY, dataUrl);
}

export function clearCachedCustomAvatar() {
  setCachedCustomAvatar(null);
}

/** 中心裁方 + 缩放到 size，输出 JPEG */
export async function cropCompressAvatar(file: File, size = 512, quality = 0.82): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('图片无法打开'));
      el.src = url;
    });
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (!iw || !ih) throw new Error('图片尺寸无效');
    const side = Math.min(iw, ih);
    const sx = Math.floor((iw - side) / 2);
    const sy = Math.floor((ih - side) / 2);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法处理图片');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('压缩失败'))),
        'image/jpeg',
        quality,
      );
    });
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('读取失败'));
    reader.readAsDataURL(blob);
  });
}
