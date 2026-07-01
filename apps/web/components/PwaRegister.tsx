'use client';

import { useEffect } from 'react';
import { BASE_PATH } from '@/lib/basePath';
import { reschedule } from '@/lib/reminder';
import { startDigestPoller } from '@/lib/push_digest';

export default function PwaRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const scope = `${BASE_PATH || ''}/`;
    const url = `${BASE_PATH || ''}/sw.js`;
    navigator.serviceWorker.register(url, { scope }).catch(() => {});
    reschedule();
    startDigestPoller();
  }, []);
  return null;
}
