'use client';

import { useEffect, useMemo, useState } from 'react';
import { SheetCloseButton } from '@/components/PageBackBar';
import { useToast } from '@/components/ui/ToastProvider';
import {
  buildAnalysisSharePack,
  type AnalysisShareInput,
  type WeChatShareTarget,
} from '@/lib/analysis_share';
import { effectiveId } from '@/lib/api';
import { recordShareAnswer } from '@/lib/badge_events';
import { renderShareCardPng, shareCard } from '@/lib/share_card';

type Props = AnalysisShareInput & {
  onClose: () => void;
};

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

async function downloadPng(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function WeChatShareSheet({
  refLabel,
  answerText,
  refParam,
  sharerUserCode,
  onClose,
}: Props) {
  const flash = useToast();
  const pack = useMemo(
    () =>
      buildAnalysisSharePack({
        refLabel,
        answerText,
        refParam,
        sharerUserCode: sharerUserCode ?? effectiveId(),
      }),
    [refLabel, answerText, refParam, sharerUserCode],
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;
    void (async () => {
      const blob = await renderShareCardPng(pack.card);
      if (!blob || cancelled) return;
      const url = URL.createObjectURL(blob);
      revoked = url;
      setPreviewUrl(url);
    })();
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [pack.card]);

  const markShared = () => {
    recordShareAnswer();
  };

  const doCopyText = async (target: WeChatShareTarget) => {
    setBusy(target);
    const ok = await copy(pack.copyText(target));
    setBusy(null);
    if (ok) {
      markShared();
      flash(
        target === 'wechat_moments'
          ? '文案已复制 · 也可先保存图片再发朋友圈'
          : '文案已复制 · 打开微信粘贴发给好友或群',
      );
    } else {
      flash('复制失败');
    }
  };

  const doCopyLink = async (target: WeChatShareTarget) => {
    setBusy(`link-${target}`);
    const ok = await copy(pack.urlFor(target));
    setBusy(null);
    if (ok) {
      markShared();
      flash(pack.friendHint);
    } else {
      flash('复制失败');
    }
  };

  const doSaveImage = async () => {
    setBusy('image');
    try {
      const blob = await renderShareCardPng(pack.card);
      if (!blob) throw new Error('render');
      await downloadPng(blob, 'presto-analysis-share.png');
      markShared();
      flash(pack.momentsHint);
    } catch {
      flash('保存图片失败');
    } finally {
      setBusy(null);
    }
  };

  const doSystemShare = async () => {
    setBusy('system');
    try {
      const url = pack.urlFor('wechat_friend');
      const nav = navigator as Navigator & {
        share?: (d: { title?: string; text?: string; url?: string }) => Promise<void>;
      };
      if (nav.share) {
        await nav.share({ title: pack.title, text: pack.lead, url });
        markShared();
        flash('已调起系统分享');
        return;
      }
      const ok = await shareCard(pack.card);
      if (ok) {
        await copy(url);
        markShared();
        flash('已保存分享图，链接已复制');
      } else {
        flash('分享失败');
      }
    } catch {
      /* 用户取消 */
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="sheet-backdrop" style={{ zIndex: 160 }} onClick={onClose}>
      <div
        className="sheet card wechat-share-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="分享到微信"
      >
        <div className="section-row" style={{ marginTop: 0 }}>
          <strong>分享解读</strong>
          <SheetCloseButton onClick={onClose} />
        </div>

        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="wechat-share-preview"
            src={previewUrl}
            alt="分享图预览"
          />
        ) : (
          <p className="muted" style={{ margin: '12px 0' }}>生成分享图…</p>
        )}

        <p className="muted wechat-share-lead">{pack.lead}</p>

        <div className="wechat-share-actions">
          <button
            type="button"
            className="btn"
            disabled={!!busy}
            onClick={() => void doCopyLink('wechat_friend')}
          >
            {busy === 'link-wechat_friend' ? '…' : '复制链接 · 发好友'}
          </button>
          <button
            type="button"
            className="btn"
            disabled={!!busy}
            onClick={() => void doCopyText('wechat_group')}
          >
            {busy === 'wechat_group' ? '…' : '复制文案 · 发群'}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={!!busy}
            onClick={() => void doSaveImage()}
          >
            {busy === 'image' ? '…' : '保存图片 · 发朋友圈'}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={!!busy}
            onClick={() => void doSystemShare()}
          >
            {busy === 'system' ? '…' : '系统分享'}
          </button>
        </div>

        <ul className="wechat-share-hints muted">
          <li>发好友 / 群：复制链接或文案后，到微信粘贴</li>
          <li>发朋友圈：先保存图片，再从相册发到朋友圈</li>
          <li>链接带渠道参数，打开后可继续问小爱</li>
        </ul>
      </div>
    </div>
  );
}
