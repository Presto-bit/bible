/** 出站分享统一站点：强制 canonical，避免 PWA/多入口 origin 碎片化 */

export const CANONICAL_SHARE_ORIGIN = 'https://2sc.prestoai.cn';

/** 出站与 OG 统一用此 origin（可用 NEXT_PUBLIC_SITE_URL 覆盖） */
export function canonicalShareOrigin(): string {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL || CANONICAL_SHARE_ORIGIN).trim();
  return raw.replace(/\/$/, '') || CANONICAL_SHARE_ORIGIN;
}

/** 把任意站内 path/url 归一到 canonical 绝对地址 */
export function toCanonicalShareUrl(pathOrUrl: string): string {
  const origin = canonicalShareOrigin();
  try {
    if (/^https?:\/\//i.test(pathOrUrl)) {
      const u = new URL(pathOrUrl);
      return `${origin}${u.pathname}${u.search}${u.hash}`;
    }
    const path = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
    return new URL(path, `${origin}/`).toString();
  } catch {
    return origin;
  }
}

/** OG / 微信预览副文案：统一带安装意图 */
export function withShareInstallHint(description: string, extra?: string): string {
  const base = (description || '').trim();
  const hint = (extra || '打开后用浏览器保存到主屏幕，下次一点就开').trim();
  if (!base) return hint;
  if (base.includes('主屏幕') || base.includes('保存到')) return base;
  const clipped = base.length > 90 ? `${base.slice(0, 89)}…` : base;
  return `${clipped} · ${hint}`;
}
