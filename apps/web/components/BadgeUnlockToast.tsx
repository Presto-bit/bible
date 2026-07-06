'use client';

import { useEffect, useState } from 'react';
import { BADGE_UNLOCK_EVENT } from '@/lib/badge_unlock';

type Toast = { id: string; label: string; icon: string };

export default function BadgeUnlockToast() {
  const [queue, setQueue] = useState<Toast[]>([]);

  useEffect(() => {
    const onUnlock = (e: Event) => {
      const d = (e as CustomEvent<{ id: string; label: string; icon: string }>).detail;
      if (!d?.id) return;
      setQueue((q) => [...q, d]);
    };
    window.addEventListener(BADGE_UNLOCK_EVENT, onUnlock);
    return () => window.removeEventListener(BADGE_UNLOCK_EVENT, onUnlock);
  }, []);

  useEffect(() => {
    if (!queue.length) return;
    const t = window.setTimeout(() => {
      setQueue((q) => q.slice(1));
    }, 2800);
    return () => window.clearTimeout(t);
  }, [queue]);

  const current = queue[0];
  if (!current) return null;

  return (
    <div className="badge-unlock-toast" role="status" aria-live="polite">
      <span className="badge-unlock-icon">{current.icon}</span>
      <span>
        解锁成就 · <strong>{current.label}</strong>
      </span>
    </div>
  );
}
