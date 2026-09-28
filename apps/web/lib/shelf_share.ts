/** 书架书目出站分享：氛围卡 + 深链回详情页 */

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

export function shelfBookSharePath(bookId: string): string {
  return `/shelf/${encodeURIComponent(bookId)}`;
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
    `推荐一本好书《${title}》`,
    meta || null,
    `在${BRAND_NAME}打开，一起读。`,
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
