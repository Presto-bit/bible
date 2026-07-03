'use client';

import { useEffect, useState } from 'react';
import { offlinePackStatus, type OfflinePackStatus } from '@/lib/offline_bootstrap';

export default function OfflineBar() {
  const [online, setOnline] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [pack, setPack] = useState<OfflinePackStatus>('missing');

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    void offlinePackStatus().then(setPack).catch(() => setPack('missing'));
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  if (online) return null;

  const packLabel =
    pack === 'ready' ? '离线经库已就绪'
      : pack === 'loading' ? '离线经库下载中…'
        : pack === 'failed' ? '离线经库下载未完成，可在设置中重试'
          : '离线经库未安装';

  return (
    <div className="offline-bar">
      <button type="button" className="offline-bar-main" onClick={() => setExpanded((v) => !v)}>
        当前离线 · 圣经与笔记可继续使用
      </button>
      {expanded ? <span className="offline-bar-detail">{packLabel} · 小爱、发现、群组需联网</span> : null}
    </div>
  );
}
