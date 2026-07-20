'use client';

import { useEffect, useState } from 'react';
import { useOnline } from '@/lib/use_online';
import { offlinePackStatus, type OfflinePackStatus } from '@/lib/offline_bootstrap';

/**
 * 离线提示：浮在底栏上方，不占文档流、不顶内容。
 * 阅读沉浸态隐藏，避免与 reader-topbar 叠层。
 */
export default function OfflineBar() {
  const online = useOnline();
  const [expanded, setExpanded] = useState(false);
  const [pack, setPack] = useState<OfflinePackStatus>('missing');
  const [readerActive, setReaderActive] = useState(false);

  useEffect(() => {
    void offlinePackStatus().then(setPack).catch(() => setPack('missing'));
  }, [online]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const sync = () => {
      setReaderActive(document.body.classList.contains('reader-active'));
    };
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (online) setExpanded(false);
  }, [online]);

  if (online || readerActive) return null;

  const packLabel =
    pack === 'ready' ? '离线经库已就绪'
      : pack === 'loading' ? '离线经库下载中…'
        : pack === 'failed' ? '离线经库未完成，可在设置中重试'
          : '离线经库未安装';

  return (
    <div className="offline-bar" role="status">
      <button
        type="button"
        className="offline-bar-main"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        当前离线 · 圣经与笔记可用
      </button>
      {expanded ? (
        <span className="offline-bar-detail">
          {packLabel} · 小爱、发现、群组需联网
        </span>
      ) : null}
    </div>
  );
}
