'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  clearOfflinePack,
  downloadOfflinePack,
  isOfflinePackReady,
  loadPackMeta,
  type DownloadProgress,
  type OfflinePackMeta,
} from '@/lib/offline_pack';
import { offlineAutoDownloadDone } from '@/lib/offline_bootstrap';
import { resetLocalBibleDb } from '@/lib/bible_local';

function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function OfflineBibleCard() {
  const [ready, setReady] = useState(false);
  const [meta, setMeta] = useState<OfflinePackMeta | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setReady(await isOfflinePackReady());
    setMeta(loadPackMeta());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onDownload = async () => {
    setBusy(true);
    setErr(null);
    try {
      await downloadOfflinePack(setProgress);
      resetLocalBibleDb();
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const onClear = async () => {
    if (!window.confirm('确定清除离线经库？清除后需重新下载才能离线阅读。')) return;
    await clearOfflinePack();
    resetLocalBibleDb();
    localStorage.removeItem('presto_offline_auto_done');
    localStorage.removeItem('presto_offline_auto_fail');
    await refresh();
  };

  return (
    <div className="card card-2 offline-bible-card">
      <div className="section-row" style={{ marginTop: 0 }}>
        <strong>离线圣经</strong>
        {ready && <span className="font-pill">已安装</span>}
      </div>
      <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
        下载后可在无网络时阅读圣经新译本与和合本全文并搜索（约 12 MB 压缩包，含双译本）。
        {!ready && offlineAutoDownloadDone() === false && ' 首次打开会在后台自动下载。'}
      </p>
      {meta && (
        <p className="muted" style={{ fontSize: 12 }}>
          版本 {meta.version} · {formatBytes(meta.bytes)}
        </p>
      )}
      {progress && (
        <p className="muted" style={{ fontSize: 12 }}>
          {progress.message} {progress.percent > 0 ? `${progress.percent}%` : ''}
        </p>
      )}
      {err && <p style={{ color: '#c0392b', fontSize: 13 }}>{err}</p>}
      <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
        {!ready ? (
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void onDownload()}>
            {busy ? '下载中…' : '下载完整圣经'}
          </button>
        ) : (
          <>
            <button type="button" className="btn" disabled={busy} onClick={() => void onDownload()}>
              重新下载
            </button>
            <button type="button" className="btn" onClick={() => void onClear()}>
              清除离线包
            </button>
          </>
        )}
      </div>
    </div>
  );
}
