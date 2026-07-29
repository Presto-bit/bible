/** 产品邀请分享：邀请朋友一起读彼爱 */

import { buildTrackedUrl } from './acquisition';
import { effectiveId } from './api';
import { BRAND_NAME, BRAND_TAGLINE } from './brand';
import type { ShareCardInput } from './share_card';
import { shareCard } from './share_card';
import { isUserCode } from './user_code';

export const INVITE_SHARE_TITLE = `${BRAND_NAME} · 有人陪你读懂圣经`;

export const INVITE_SHARE_TEXT =
  `我在用${BRAND_NAME}读经——不只自己读，还能问明白每一节。\n打开后保存到主屏幕，我们一起读。`;

export const INVITE_LANDING_SUPPORT =
  '读的时候能问，不懂的经文有人帮你拆开';

/** 落地页能力区标题 */
export const INVITE_CAPABILITY_TITLE = '在彼爱，读经不孤单';

export const INVITE_CAPABILITIES: ReadonlyArray<{ title: string; desc: string }> = [
  { title: '读圣经', desc: '安静读完每一章' },
  { title: '问小爱', desc: '不懂的经文，当场问明白' },
  { title: '一起共读', desc: '邀朋友打卡，不独行' },
  { title: '留在手机', desc: '保存到主屏幕，像打开 App' },
];

export type ShareInviteResult = 'shared' | 'copied' | 'cancelled' | 'failed';

export function inviteShareUrl(sharerUserCode?: string | null): string {
  const code = (sharerUserCode || '').trim();
  const l3 = code && isUserCode(code) ? `invite.u:${code}` : 'invite';
  return buildTrackedUrl('/share/app', {
    l1: 'share',
    l2: 'system_share',
    l3,
  });
}

export function inviteShareCard(): ShareCardInput {
  return {
    title: INVITE_SHARE_TITLE,
    subtitle: '邀请朋友一起读',
    body: '陪你读经，也帮你读懂。保存到主屏幕，像打开 App 一样安静读。',
    footer: `${BRAND_NAME} · ${BRAND_TAGLINE}`,
  };
}

/** 调起系统分享；失败则分享图 + 复制链接 */
export async function shareInviteProduct(
  sharerUserCode?: string | null,
): Promise<ShareInviteResult> {
  const code = sharerUserCode ?? effectiveId();
  const url = inviteShareUrl(code);
  const clipboardText = `${INVITE_SHARE_TEXT}\n${url}`;

  const nav = navigator as Navigator & {
    share?: (d: { title?: string; text?: string; url?: string }) => Promise<void>;
  };

  if (nav.share) {
    try {
      await nav.share({
        title: INVITE_SHARE_TITLE,
        text: INVITE_SHARE_TEXT,
        url,
      });
      return 'shared';
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'AbortError') return 'cancelled';
    }
  }

  try {
    await shareCard(inviteShareCard());
    await navigator.clipboard.writeText(clipboardText);
    return 'copied';
  } catch {
    try {
      await navigator.clipboard.writeText(clipboardText);
      return 'copied';
    } catch {
      return 'failed';
    }
  }
}
