/** 解读外部分享：优先服务端快照，失败降级 query 截断链 */

import {
  buildAnalysisSharePack,
  extractShareCopy,
  type AnalysisShareInput,
} from '@/lib/analysis_share';
import { createAnalysisShareSnapshot, effectiveId, type Citation } from '@/lib/api';
import { recordShareAnswer } from '@/lib/badge_events';
import { shareCardOutbound } from '@/lib/share_card';
import type { ShareOutboundResult } from '@/lib/share_outbound';

export type ShareAnalysisResult = ShareOutboundResult;

/**
 * 点击「分享」即调起系统分享；取消不下图；失败只复制文案+链接。
 * 优先创建服务端快照，保证跨设备可读全文与来源。
 */
export async function shareAnalysis(
  input: AnalysisShareInput & { citations?: Citation[] },
): Promise<ShareAnalysisResult> {
  const sharerUserCode = input.sharerUserCode ?? effectiveId();
  const { lead } = extractShareCopy(input.answerText, input.refLabel);
  let snapshotId: string | undefined;
  try {
    const snap = await createAnalysisShareSnapshot({
      ref_label: input.refLabel,
      ref_param: input.refParam,
      answer_markdown: input.answerText,
      lead,
      citations: input.citations,
    });
    snapshotId = snap.id;
  } catch {
    snapshotId = undefined;
  }

  const pack = buildAnalysisSharePack({
    ...input,
    sharerUserCode,
    snapshotId,
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
