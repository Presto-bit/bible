/** 本机阅读/成就等 localStorage 变更后通知 UI 刷新（含云同步 pull、多 Tab） */

export const LOCAL_DATA_CHANGED = 'presto-local-data-changed';

export function notifyLocalDataChanged(source?: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(LOCAL_DATA_CHANGED, { detail: { source } }),
  );
}

export function subscribeLocalDataChanged(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key?.startsWith('presto_')) fn();
  };
  window.addEventListener(LOCAL_DATA_CHANGED, fn);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(LOCAL_DATA_CHANGED, fn);
    window.removeEventListener('storage', onStorage);
  };
}
