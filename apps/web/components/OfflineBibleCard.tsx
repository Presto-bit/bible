'use client';

import { useEffect, useState } from 'react';
import { isOfflinePackReady } from '@/lib/offline_pack';

/** 阅读器内联离线提示：引导用户去设置下载 */
export function OfflineBibleCard() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void isOfflinePackReady().then(setReady);
    const onReady = () => void isOfflinePackReady().then(setReady);
    window.addEventListener('presto-offline-pack-ready', onReady);
    return () => window.removeEventListener('presto-offline-pack-ready', onReady);
  }, []);

  if (ready) return null;

  return (
    <div className="offline-bible-inline">
      <p className="muted" style={{ fontSize: 13, margin: 0 }}>
        离线阅读需先下载圣经经库。请打开「我的 → 设置 → 工具 → 下载」。
      </p>
    </div>
  );
}
