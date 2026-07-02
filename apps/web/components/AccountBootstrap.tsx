'use client';

import { useEffect } from 'react';
import { ensureAccountReady } from '@/lib/api';

/** 应用启动时静默建档 + merge-guest（P0/P2） */
export default function AccountBootstrap() {
  useEffect(() => {
    void ensureAccountReady();
  }, []);
  return null;
}
