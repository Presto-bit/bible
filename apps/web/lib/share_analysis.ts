/** 解读外部分享：系统分享契约（图可选 + 文 + 落地链） */

import { buildAnalysisSharePack, type AnalysisShareInput } from '@/lib/analysis_share';
import { effectiveId } from '@/lib/api';
import { recordShareAnswer } from '@/lib/badge_events';
import { shareCardOutbound } from '@/lib/share_card';
import type { ShareOutboundResult } from '@/lib/share_outbound';

export type ShareAnalysisResult = ShareOutboundResult;

/**
 * 点击「分享」即调起系统分享；取消不下图；失败只复制文案+链接。
 */
export async function shareAnalysis(input: AnalysisShareInput): Promise<ShareAnalysisResult> {
  const pack = buildAnalysisSharePack({
    ...input,
    sharerUserCode: input.sharerUserCode ?? effectiveId(),
  });
  const url = pack.urlFor('system_share');
  const result = await shareCardOutbound({
    ...pack.card,
    badge: '小爱解读',
    day: 3,
    shareTitle: pack.title,
    shareText: pack.shareText,
    shareUrl: url,
    allowDownload: false,
  });
  if (result === 'shared' || result === 'copied') {
    recordShareAnswer();
  }
  return result;
}
