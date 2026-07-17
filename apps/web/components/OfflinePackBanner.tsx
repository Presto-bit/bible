'use client';

import { useEffect, useState } from 'react';
import { offlinePackStatus, type OfflinePackStatus } from '@/lib/offline_bootstrap';
import {
  getOfflineDownloadSnapshot,
  isOfflineDownloadActive,
  offlineDownloadLabel,
  subscribeOfflineDownload,
} from '@/lib/offline_download_job';

const OFFLINE_PACK_READY = 'presto-offline-pack-ready';

const LABEL: Record<Exclude<OfflinePackStatus, 'ready'>, string> = {
  missing: '经包尚未下载，离线阅读不可用',
  failed: '经包下载失败，请检查网络后重试',
  loading: '正在后台下载经包…',
};

/** 经包未就绪提示（放在设置等非首页入口） */
export default function OfflinePackBanner({
  onDownload,
}: {
  /** 点击「去下载」时回调；未传则不显示按钮 */
  onDownload?: () => void;
}) {
  const [status, setStatus] = useState<OfflinePackStatus>('missing');
  const [jobLabel, setJobLabel] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void offlinePackStatus().then((s) => {
        if (!cancelled) setStatus(s);
      });
      const snap = getOfflineDownloadSnapshot();
      if (!cancelled) {
        setJobLabel(
          isOfflineDownloadActive() ? offlineDownloadLabel(snap) : null,
        );
      }
    };
    refresh();
    window.addEventListener(OFFLINE_PACK_READY, refresh);
    const unsub = subscribeOfflineDownload(refresh);
    const t = window.setInterval(refresh, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
      window.removeEventListener(OFFLINE_PACK_READY, refresh);
      unsub();
    };
  }, []);

  if (status === 'ready' && !jobLabel) return null;

  const text =
    jobLabel ??
    (status === 'ready' ? null : LABEL[status as Exclude<OfflinePackStatus, 'ready'>]);
  if (!text) return null;

  return (
    <div className="offline-pack-banner card card-2" style={{ marginBottom: 10 }}>
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>{text}</p>
      {!jobLabel && status !== 'loading' && onDownload ? (
        <button
          type="button"
          className="text-link"
          style={{ fontSize: 13, marginTop: 6, padding: 0, border: 0, background: 'none', cursor: 'pointer' }}
          onClick={onDownload}
        >
          去下载离线经包
        </button>
      ) : null}
    </div>
  );
}
