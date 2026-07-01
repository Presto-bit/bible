'use client';

import { useEffect, useState } from 'react';

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

// 捕获 beforeinstallprompt，提供「添加到主屏幕」按钮（PWA 安装）。
export default function InstallBanner() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!deferred || hidden) return null;

  return (
    <div
      style={{
        position: 'fixed',
        left: 16,
        right: 16,
        bottom: 16,
        maxWidth: 688,
        margin: '0 auto',
        background: 'var(--accent-deep)',
        color: '#fff',
        borderRadius: 14,
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        zIndex: 50,
      }}
    >
      <span style={{ flex: 1, fontSize: 14 }}>把「读经」添加到主屏幕，离线也能打开</span>
      <button
        style={{
          background: '#fff',
          color: 'var(--accent-deep)',
          border: 'none',
          borderRadius: 18,
          padding: '6px 14px',
          cursor: 'pointer',
        }}
        onClick={async () => {
          await deferred.prompt();
          await deferred.userChoice;
          setDeferred(null);
        }}
      >
        添加
      </button>
      <button
        style={{ background: 'transparent', color: '#fff', border: 'none', cursor: 'pointer' }}
        onClick={() => setHidden(true)}
        aria-label="关闭"
      >
        ✕
      </button>
    </div>
  );
}
