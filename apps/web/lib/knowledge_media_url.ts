import { contentAssetUrl } from '@/lib/api_core';
import { clientWithBasePath } from '@/lib/basePath';

/**
 * 探索/手稿媒体地址：
 * - `/content/...` → API（上传的封面/音视频）
 * - 其它相对路径 → 静态站资源
 * - http(s)/data/blob → 原样
 */
export function knowledgeMediaUrl(path: string | undefined | null): string {
  const raw = (path || '').trim();
  if (!raw) return clientWithBasePath('/knowledge/infographics/_paper_texture.jpg');
  if (/^https?:\/\//i.test(raw) || raw.startsWith('data:') || raw.startsWith('blob:')) {
    return raw;
  }
  if (raw.startsWith('/content/')) {
    return contentAssetUrl(raw);
  }
  return clientWithBasePath(raw);
}
