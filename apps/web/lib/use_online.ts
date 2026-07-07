'use client';

import { useEffect, useState } from 'react';

export function useOnline(): boolean {
  // SSR 与首帧 hydration 默认在线，避免服务端 false / 客户端 true 不一致
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  return online;
}
