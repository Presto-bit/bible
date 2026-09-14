'use client';

import { useSyncExternalStore } from 'react';

const FLUTTER_ONLINE_EVENT = 'peiai-flutter-online';

function getFlutterOnlineOverride(): boolean | null {
  if (typeof window === 'undefined') return null;
  const v = window.__PEIAI_FLUTTER__?.online;
  return typeof v === 'boolean' ? v : null;
}

function subscribeOnline(onStoreChange: () => void): () => void {
  window.addEventListener('online', onStoreChange);
  window.addEventListener('offline', onStoreChange);
  window.addEventListener(FLUTTER_ONLINE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener('online', onStoreChange);
    window.removeEventListener('offline', onStoreChange);
    window.removeEventListener(FLUTTER_ONLINE_EVENT, onStoreChange);
  };
}

function getOnlineSnapshot(): boolean {
  const flutter = getFlutterOnlineOverride();
  if (flutter === false) return false;
  if (flutter === true) return true;
  return navigator.onLine;
}

/** SSR / 预渲染默认在线，避免 hydration 不一致 */
function getServerOnlineSnapshot(): boolean {
  return true;
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, getOnlineSnapshot, getServerOnlineSnapshot);
}

export function isBrowserOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  const flutter = getFlutterOnlineOverride();
  if (flutter === false) return false;
  if (flutter === true) return true;
  return navigator.onLine;
}
