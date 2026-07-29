/** 解读外部分享：直接调起系统分享（Web Share API） */

import { buildAnalysisSharePack, type AnalysisShareInput } from '@/lib/analysis_share';
import { effectiveId } from '@/lib/api';
import { recordShareAnswer } from '@/lib/badge_events';
import { shareCard } from '@/lib/share_card';

export type ShareAnalysisResult = 'shared' | 'copied' | 'cancelled' | 'failed';

/**
 * 点击「分享」即调起系统分享面板；无 Web Share 时降级为分享图 + 复制链接。
 */
export async function shareAnalysis(input: AnalysisShareInput): Promise<ShareAnalysisResult> {
  const pack = buildAnalysisSharePack({
    ...input,
    sharerUserCode: input.sharerUserCode ?? effectiveId(),
  });
  const url = pack.urlFor('system_share');
  const clipboardText = `${pack.shareText}\n${url}`;

  const nav = navigator as Navigator & {
    share?: (d: { title?: string; text?: string; url?: string; files?: File[] }) => Promise<void>;
    canShare?: (d: { files?: File[] }) => boolean;
  };

  if (nav.share) {
    try {
      // 优先：文字 + 链接（微信/系统分享面板）
      await nav.share({ title: pack.title, text: pack.shareText, url });
      recordShareAnswer();
      return 'shared';
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'AbortError') return 'cancelled';
      /* fallthrough */
    }
  }

  try {
    await shareCard(pack.card);
    await navigator.clipboard.writeText(clipboardText);
    recordShareAnswer();
    return 'copied';
  } catch {
    try {
      await navigator.clipboard.writeText(clipboardText);
      recordShareAnswer();
      return 'copied';
    } catch {
      return 'failed';
    }
  }
}
