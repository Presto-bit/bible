/** 自定义头像：预设 id 仍为 a1–a50；上传后 avatar_id = `u:key:<storage_key>` */

import { API_BASE, contentAssetUrl } from './api';
import { userLsGet, userLsRemove, userLsSet } from './user_storage';

export const CUSTOM_AVATAR_PREFIX = 'u:';
export const CUSTOM_AVATAR_KEY_PREFIX = 'u:key:';
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

/** 从历史签名 URL / 各类引用中抽出 storage_key */
export function extractAvatarStorageKey(id: string): string | null {
  const raw = id.trim();
  if (!raw) return null;
  if (raw.startsWith(CUSTOM_AVATAR_KEY_PREFIX)) {
    return raw.slice(CUSTOM_AVATAR_KEY_PREFIX.length).trim() || null;
  }
  // u:/social/media/profile-asset?key=...
  const withoutPrefix = raw.startsWith(CUSTOM_AVATAR_PREFIX)
    ? raw.slice(CUSTOM_AVATAR_PREFIX.length)
    : raw;
  try {
    const base =
      typeof window !== 'undefined' ? window.location.origin : 'https://local.invalid';
    const u = new URL(withoutPrefix, base);
    const k =
      u.searchParams.get('key')
      || u.searchParams.get('k')
      || u.searchParams.get('storage_key');
    if (k) return k;
    // /social/media/assets/name.jpg?...&k=
    const m = u.pathname.match(/\/social\/media\/assets\/([^/?#]+)/);
    if (m?.[1]) {
      return decodeURIComponent(m[1]);
    }
  } catch {
    /* ignore */
  }
  if (
    withoutPrefix.startsWith('profile-avatar-')
    || withoutPrefix.startsWith('social-im/')
    || withoutPrefix.startsWith('profile-avatars/')
  ) {
    return withoutPrefix;
  }
  return null;
}

/** 规范为持久 id：`u:key:<storage_key>`；无法识别则原样返回 */
export function normalizeCustomAvatarId(id: string): string {
  const t = id.trim();
  if (!t) return t;
  if (t.startsWith('data:') || t.startsWith('u:data:')) return t;
  const key = extractAvatarStorageKey(t);
  if (key) return `${CUSTOM_AVATAR_KEY_PREFIX}${key}`;
  return t;
}

/** 解析可给 <img src> 用的地址 */
export function customAvatarSrc(id: string): string {
  const t = id.trim();
  if (t.startsWith('http://') || t.startsWith('https://') || t.startsWith('data:')) {
    // 历史短时签名链：尽量改走持久 profile-asset
    const key = extractAvatarStorageKey(t);
    if (key && (t.includes('sig=') || t.includes('/social/media/'))) {
      return contentAssetUrl(
        `/social/media/profile-asset?key=${encodeURIComponent(key)}`,
      );
    }
    return t;
  }
  if (t.startsWith(CUSTOM_AVATAR_PREFIX)) {
    const rest = t.slice(CUSTOM_AVATAR_PREFIX.length);
    if (rest.startsWith('data:')) return rest;
    if (rest.startsWith('http://') || rest.startsWith('https://')) {
      const key = extractAvatarStorageKey(rest);
      if (key && (rest.includes('sig=') || rest.includes('/social/media/'))) {
        return contentAssetUrl(
          `/social/media/profile-asset?key=${encodeURIComponent(key)}`,
        );
      }
      return rest;
    }
    if (rest.startsWith('key:')) {
      const key = rest.slice(4);
      return contentAssetUrl(
        `/social/media/profile-asset?key=${encodeURIComponent(key)}`,
      );
    }
    // u:/social/media/profile-asset?key=...
    if (rest.startsWith('/social/media/profile-asset')) {
      return contentAssetUrl(rest);
    }
    const key = extractAvatarStorageKey(t);
    if (key) {
      return contentAssetUrl(
        `/social/media/profile-asset?key=${encodeURIComponent(key)}`,
      );
    }
    return contentAssetUrl(rest.startsWith('/') ? rest : `/${rest}`);
  }
  return t;
}

export function encodeCustomAvatarId(urlOrKey: string): string {
  const u = urlOrKey.trim();
  if (!u) return '';
  if (u.startsWith(CUSTOM_AVATAR_KEY_PREFIX) || u.startsWith(CUSTOM_AVATAR_PREFIX)) {
    return normalizeCustomAvatarId(u);
  }
  if (u.startsWith('data:')) return `${CUSTOM_AVATAR_PREFIX}${u}`;
  // 优先按 storage_key 持久化
  if (
    u.startsWith('profile-avatar-')
    || u.startsWith('social-im/')
    || u.startsWith('profile-avatars/')
  ) {
    return `${CUSTOM_AVATAR_KEY_PREFIX}${u}`;
  }
  const key = extractAvatarStorageKey(u);
  if (key) return `${CUSTOM_AVATAR_KEY_PREFIX}${key}`;
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

/** @deprecated 避免误用 API_BASE 裸拼 */
export function profileAssetApiHint(): string {
  return `${API_BASE}/social/media/profile-asset`;
}
