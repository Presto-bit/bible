'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { isAutoBiblePackReady, isOfflinePackReady } from '@/lib/offline_pack';
import { markRouteNavigation } from '@/lib/pwa_tab_nav';

/** 阅读器内联离线提示：在线可先读；离线引导下载 */
export function OfflineBibleCard() {
  const [ready, setReady] = useState(false);
  const [online, setOnline] = useState(
    () => typeof navigator === 'undefined' || navigator.onLine,
  );

  useEffect(() => {
    const refresh = () => {
      void Promise.all([isOfflinePackReady(), isAutoBiblePackReady()]).then(
        ([cnv, cuvs]) => setReady(cnv || cuvs),
      );
    };
    refresh();
    const onReady = () => refresh();
    const onNet = () => setOnline(navigator.onLine);
    window.addEventListener('presto-offline-pack-ready', onReady);
    window.addEventListener('online', onNet);
    window.addEventListener('offline', onNet);
    return () => {
      window.removeEventListener('presto-offline-pack-ready', onReady);
      window.removeEventListener('online', onNet);
      window.removeEventListener('offline', onNet);
    };
  }, []);

  if (ready) return null;

  return (
    <div className="offline-bible-inline">
      {online ? (
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>
          联网时可直接读经。下载经包后，离线也能打开。
          {' '}
          <Link
            href="/profile/settings"
            className="text-link"
            onClick={() => markRouteNavigation()}
          >
            去下载
          </Link>
        </p>
      ) : (
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>
          离线阅读需先下载圣经经库。请联网后打开「我的 → 设置 → 工具 → 下载」。
        </p>
      )}
    </div>
  );
}
