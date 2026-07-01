'use client';

import { useEffect } from 'react';

// 注册 Service Worker（App Shell 预缓存 + 离线兜底）。
export default function PwaRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    const url = '/2sc/sw.js';
    navigator.serviceWorker.register(url, { scope: '/2sc/' }).catch(() => {
      // 注册失败不影响主流程
    });
  }, []);
  return null;
}
