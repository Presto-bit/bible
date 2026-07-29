'use client';

import { useState } from 'react';
import { ShareToSocialSheet } from '@/components/ShareToSocialSheet';
import {
  buildDailyVerseShareText,
  dailyVerseShareUrl,
  shareDailyVerseCard,
} from '@/lib/daily_verse_share';
import { api } from '@/lib/api';

type Props = {
  refLabel: string;
  text: string;
  day?: number;
  versionLabel?: string;
  onClose: () => void;
  onToast?: (msg: string) => void;
};

export function DailyVerseShareSheet({
  refLabel,
  text,
  day,
  versionLabel = '和合本',
  onClose,
  onToast,
}: Props) {
  const [socialOpen, setSocialOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const shareText = buildDailyVerseShareText({
    ref: refLabel,
    text,
    day,
    versionLabel,
  });
  const link = dailyVerseShareUrl(day);

  const record = async () => {
    try {
      await api.recordDailyVerseShare(day);
    } catch {
      /* 统计失败不影响分享 */
    }
  };

  const shareCard = async () => {
    setBusy(true);
    setErr(null);
    try {
      const result = await shareDailyVerseCard({
        ref: refLabel,
        text,
        day,
        versionLabel,
      });
      if (result === 'cancelled') return;
      if (result === 'failed') {
        setErr('无法生成分享卡片');
        return;
      }
      await record();
      onToast?.(result === 'downloaded' ? '已保存经文卡片' : '已调起分享');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const copyText = async () => {
    const payload = `${shareText}\n${link}`;
    try {
      await navigator.clipboard.writeText(payload);
      await record();
      onToast?.('已复制文案');
    } catch {
      setErr('复制失败，请手动选择文字');
    }
  };

  if (socialOpen) {
    return (
      <ShareToSocialSheet
        ref={refLabel}
        refLabel={refLabel}
        body={shareText}
        kind="verse"
        onClose={() => {
          setSocialOpen(false);
          onClose();
        }}
        onDone={async (target) => {
          await record();
          onToast?.(`已分享到${target}`);
        }}
      />
    );
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet card daily-verse-share-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="分享今日经文"
      >
        <div className="half-sheet-grab" aria-hidden />
        <div className="section-row group-settings-sheet-head">
          <button type="button" className="text-link" onClick={onClose}>
            关闭
          </button>
          <strong>分享今日经文</strong>
          <span style={{ width: 36 }} aria-hidden />
        </div>
        <p className="muted daily-verse-share-preview">
          {text.slice(0, 80)}
          {text.length > 80 ? '…' : ''}
        </p>
        <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          {refLabel}
          {versionLabel ? ` · ${versionLabel}` : ''}
        </p>
        <div className="daily-verse-share-actions">
          <button type="button" className="btn btn-block" disabled={busy} onClick={shareCard}>
            生成经文卡并分享
          </button>
          <button type="button" className="btn btn-ghost btn-block" onClick={() => setSocialOpen(true)}>
            分享到群 / 好友
          </button>
          <button type="button" className="text-link" onClick={copyText}>
            复制文案与链接
          </button>
        </div>
        {err ? (
          <p className="muted" role="alert" style={{ marginTop: 8 }}>
            {err}
          </p>
        ) : null}
      </div>
    </div>
  );
}
