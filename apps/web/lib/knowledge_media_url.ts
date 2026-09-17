import { contentAssetUrl } from '@/lib/api_core';
import { clientAssetUrl } from '@/lib/basePath';

/**
 * 探索/手稿媒体地址：
 * - `/content/...` → API（上传的封面/音视频）
 * - 其它相对路径 → 静态站绝对地址（避免 WebView / SW 相对路径空白）
 * - http(s)/data/blob → 原样
 */
export function knowledgeMediaUrl(path: string | undefined | null): string {
  const raw = (path || '').trim();
  if (!raw) return clientAssetUrl('/knowledge/infographics/_paper_texture.jpg');
  if (/^https?:\/\//i.test(raw) || raw.startsWith('data:') || raw.startsWith('blob:')) {
    return raw;
  }
  if (raw.startsWith('/content/')) {
    return contentAssetUrl(raw);
  }
  return clientAssetUrl(raw);
}

/**
 * 手稿栅格图：同路径优先 WebP（体积约 PNG 的 1/10），PNG 作回退。
 * 调用方须在 <img onError> 时回退到 fallback（部分 WebView 对缺失 webp 的 picture 不回退）。
 */
export function knowledgeRasterSources(path: string | undefined | null): {
  webp?: string;
  fallback: string;
} {
  const raw = (path || '').trim();
  const fallback = knowledgeMediaUrl(raw);
  if (!raw || /^https?:\/\//i.test(raw) || raw.startsWith('data:') || raw.startsWith('blob:')) {
    return { fallback };
  }
  if (raw.startsWith('/knowledge/') && /\.png$/i.test(raw)) {
    return {
      webp: knowledgeMediaUrl(raw.replace(/\.png$/i, '.webp')),
      fallback,
    };
  }
  return { fallback };
}
