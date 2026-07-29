/** 产品邀请分享：邀请朋友一起读彼爱 */

import { buildTrackedUrl } from './acquisition';
import { effectiveId } from './api';
import { BRAND_NAME, BRAND_TAGLINE } from './brand';
import { shareCardOutbound } from './share_card';
import type { ShareOutboundResult } from './share_outbound';
import { isUserCode } from './user_code';

export const INVITE_SHARE_TITLE = `${BRAND_NAME} · 陪你读懂圣经`;

export const INVITE_SHARE_TEXT =
  `我在用${BRAND_NAME}读经——不只自己读，还能问明白每一节。\n打开后保存到主屏幕，我们一起读。`;

export const INVITE_LANDING_SUPPORT =
  '读的时候能问，不懂的经文帮你拆解';

/** 落地页能力区标题 */
export const INVITE_CAPABILITY_TITLE = '在彼爱，读经不孤单';

export const INVITE_CAPABILITIES: ReadonlyArray<{ title: string; desc: string }> = [
  { title: '读圣经', desc: '安静读完每一章' },
  { title: '问小爱', desc: '不懂的经文，当场问明白' },
  { title: '一起共读', desc: '邀朋友打卡，不独行' },
  { title: '留在手机', desc: '保存到主屏幕，像打开 App' },
];

export type ShareInviteResult = ShareOutboundResult;

export function inviteShareUrl(sharerUserCode?: string | null): string {
  const code = (sharerUserCode || '').trim();
  const l3 = code && isUserCode(code) ? `invite.u:${code}` : 'invite';
  return buildTrackedUrl('/share/app', {
    l1: 'share',
    l2: 'system_share',
    l3,
  });
}

/** 调起系统分享；取消不下图；失败只复制文案+链接 */
export async function shareInviteProduct(
  sharerUserCode?: string | null,
): Promise<ShareInviteResult> {
  const code = sharerUserCode ?? effectiveId();
  const url = inviteShareUrl(code);
  return shareCardOutbound({
    title: INVITE_SHARE_TITLE,
    subtitle: '邀请朋友一起读',
    body: '陪你读经，也帮你读懂。保存到主屏幕，像打开 App 一样安静读。',
    footer: `${BRAND_NAME} · ${BRAND_TAGLINE}`,
    badge: '产品邀请',
    day: 7,
    shareTitle: INVITE_SHARE_TITLE,
    shareText: INVITE_SHARE_TEXT,
    shareUrl: url,
    allowDownload: false,
  });
}
