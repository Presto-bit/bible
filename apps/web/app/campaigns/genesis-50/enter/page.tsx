'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  isGenesis50Href,
  normalizeGenesis50Href,
  resolveGenesis50InviteCode,
  resolveGenesis50OpenUrl,
} from '@/lib/genesis50_auth';

function Genesis50EnterInner() {
  const search = useSearchParams();
  const [message, setMessage] = useState('正在进入活动…');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const raw = (search.get('href') || search.get('target') || '').trim();
    if (!raw) {
      setError('缺少活动链接，请从彼爱首页重新进入。');
      return;
    }
    const href = normalizeGenesis50Href(raw);
    if (!isGenesis50Href(href)) {
      setError('链接无效，请联系活动管理员。');
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        setMessage('正在验证邀请…');
        const target = await resolveGenesis50OpenUrl(href);
        if (cancelled) return;
        setMessage('正在打开…');
        window.location.replace(target);
      } catch (e) {
        if (cancelled) return;
        const code = resolveGenesis50InviteCode(href);
        console.warn('[genesis50-bridge]', e);
        setError(
          `自动进入失败（邀请码 ${code}）。请检查网络后重试，或从首页再次进入。`,
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [search]);

  if (error) {
    return (
      <main
        className="container"
        style={{
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          textAlign: 'center',
        }}
      >
        <p style={{ marginBottom: 16, lineHeight: 1.6 }}>{error}</p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => window.location.reload()}
        >
          重试
        </button>
      </main>
    );
  }

  return (
    <main
      className="container"
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        color: 'var(--muted, #6b6560)',
      }}
    >
      <p className="muted" style={{ marginBottom: 12 }}>
        创世记 50 天
      </p>
      <p>{message}</p>
    </main>
  );
}

export default function Genesis50EnterPage() {
  return (
    <Suspense
      fallback={
        <main className="container" style={{ padding: 24 }}>
          <p className="muted">正在进入活动…</p>
        </main>
      }
    >
      <Genesis50EnterInner />
    </Suspense>
  );
}
