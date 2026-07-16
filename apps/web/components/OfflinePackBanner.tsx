'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { offlinePackStatus, type OfflinePackStatus } from '@/lib/offline_bootstrap';
const OFFLINE_PACK_READY = 'presto-offline-pack-ready';

const LABEL: Record<Exclude<OfflinePackStatus, 'ready'>, string> = {
  missing: '经包尚未下载，离线阅读不可用',
  failed: '经包下载失败，请检查网络后重试',
  loading: '正在后台下载经包…',
};

/** U11：经包未就绪可见提示 */
export default function OfflinePackBanner() {
  const [status, setStatus] = useState<OfflinePackStatus>('missing');

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void offlinePackStatus().then((s) => {
        if (!cancelled) setStatus(s);
      });
    };
    refresh();
    window.addEventListener(OFFLINE_PACK_READY, refresh);
    const t = window.setInterval(refresh, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
      window.removeEventListener(OFFLINE_PACK_READY, refresh);
    };
  }, []);

  if (status === 'ready') return null;

  return (
    <div className="offline-pack-banner card card-2" style={{ marginBottom: 10 }}>
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>{LABEL[status]}</p>
      {status !== 'loading' ? (
        <Link href="/profile" className="text-link" style={{ fontSize: 13, marginTop: 6, display: 'inline-block' }}>
          前往我的 · 离线经包
        </Link>
      ) : null}
    </div>
  );
}
