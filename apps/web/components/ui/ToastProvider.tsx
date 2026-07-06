'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { CHECKIN_FLUSHED_EVENT, CHECKIN_QUEUED_EVENT } from '@/lib/checkin_queue';

const ToastContext = createContext<(msg: string) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState('');
  const timerRef = { current: 0 as ReturnType<typeof setTimeout> | 0 };

  const show = useCallback((text: string) => {
    if (!text) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    setMsg(text);
    timerRef.current = setTimeout(() => setMsg(''), 2400);
  }, []);

  useEffect(() => {
    const onQueued = () => show('打卡已保存，联网后自动发送');
    const onFlushed = (e: Event) => {
      const n = (e as CustomEvent<{ sent: number }>).detail?.sent ?? 0;
      if (n > 0) show(`已同步 ${n} 条离线打卡`);
    };
    window.addEventListener(CHECKIN_QUEUED_EVENT, onQueued);
    window.addEventListener(CHECKIN_FLUSHED_EVENT, onFlushed);
    return () => {
      window.removeEventListener(CHECKIN_QUEUED_EVENT, onQueued);
      window.removeEventListener(CHECKIN_FLUSHED_EVENT, onFlushed);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [show]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {msg ? (
        <div className="app-toast" role="status" aria-live="polite">
          {msg}
        </div>
      ) : null}
    </ToastContext.Provider>
  );
}
