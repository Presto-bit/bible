/** 书架书目出站分享：氛围卡 + `/share/shelf/{id}` 落地（对齐经文/邀请） */

import { buildTrackedUrl } from './acquisition';
import { effectiveId } from './api';
import { BRAND_NAME, BRAND_TAGLINE } from './brand';
import { shareCardOutbound, type ShareCardOutboundInput } from './share_card';
import type { ShareOutboundResult } from './share_outbound';
import { isUserCode } from './user_code';

export type ShelfBookShareInput = {
  bookId: string;
  title: string;
  subtitle?: string;
  author?: string;
  sharerUserCode?: string | null;
};

/** 落地页标题 */
export const SHELF_SHARE_LANDING_TITLE = '书架推荐';

/** 落地页副文案 */
export const SHELF_SHARE_LANDING_SUPPORT = '来自朋友的分享 · 安静读完这一本';

/** 系统分享正文末行（与邀请/经文一致：安装意图） */
export const SHELF_SHARE_CTA = `打开后保存到主屏幕，在${BRAND_NAME}一起读。`;

export function shelfBookSharePath(bookId: string): string {
  return `/share/shelf/${encodeURIComponent(bookId.trim())}`;
}

/** 站内打开书目详情（落地页 CTA） */
export function shelfBookOpenPath(bookId: string): string {
  return `/shelf/${encodeURIComponent(bookId.trim())}`;
}

export function shelfBookShareUrl(
  bookId: string,
  sharerUserCode?: string | null,
): string {
  const code = (sharerUserCode || '').trim();
  const id = bookId.trim();
  const l3 =
    code && isUserCode(code)
      ? `shelf:${id}.u:${code}`
      : `shelf:${id}`;
  return buildTrackedUrl(shelfBookSharePath(id), {
    l1: 'share',
    l2: 'system_share',
    l3,
  });
}

export function buildShelfBookShareCopy(input: ShelfBookShareInput): {
  shareTitle: string;
  shareText: string;
  card: ShareCardOutboundInput;
  url: string;
} {
  const title = (input.title || '').trim() || '推荐书目';
  const subtitle = (input.subtitle || '').trim();
  const author = (input.author || '').trim();
  const meta = [author ? `作者 ${author}` : '', subtitle].filter(Boolean).join(' · ');
  const body = meta || '在彼爱书架，安静读完这一本。';
  const url = shelfBookShareUrl(input.bookId, input.sharerUserCode ?? effectiveId());
  const shareTitle = `《${title}》｜${BRAND_NAME}`;
  const shareText = [
    `彼爱推荐一本好书《${title}》`,
    meta || null,
    SHELF_SHARE_CTA,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    shareTitle,
    shareText,
    url,
    card: {
      title: `《${title}》`,
      subtitle: author || '书架推荐',
      body,
      footer: `${BRAND_NAME} · ${BRAND_TAGLINE}`,
      badge: '书架',
      day: 6,
      shareTitle,
      shareText,
      shareUrl: url,
      allowDownload: false,
    },
  };
}

/** 调起系统分享；取消不下图；失败只复制文案+链接 */
export async function shareShelfBook(
  input: ShelfBookShareInput,
): Promise<ShareOutboundResult> {
  const pack = buildShelfBookShareCopy({
    ...input,
    sharerUserCode: input.sharerUserCode ?? effectiveId(),
  });
  return shareCardOutbound(pack.card);
}
