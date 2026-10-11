'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  buildGenesis50FallbackUrl,
  isGenesis50Href,
  normalizeGenesis50Href,
  inviteCampaignDisplayTitle,
  postGenesis50BridgeMessage,
  resolveGenesis50InviteCode,
  resolveGenesis50OpenUrl,
} from '@/lib/genesis50_auth';

function Genesis50EnterInner() {
  const search = useSearchParams();
  const [message, setMessage] = useState('正在进入活动…');
  const [error, setError] = useState<string | null>(null);
  const [manualHref, setManualHref] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState('');

  useEffect(() => {
    const raw = (search.get('href') || search.get('target') || '').trim();
    if (!raw) {
      setError('缺少活动链接，请从彼爱首页重新进入。');
      postGenesis50BridgeMessage({
        status: 'error',
        message: '缺少活动链接',
      });
      return;
    }
    const href = normalizeGenesis50Href(raw);
    if (!isGenesis50Href(href)) {
      setError('链接无效，请联系活动管理员。');
      postGenesis50BridgeMessage({ status: 'error', message: '活动链接无效' });
      return;
    }
    const code = resolveGenesis50InviteCode(href);
    setInviteCode(code);
    setManualHref(buildGenesis50FallbackUrl(href, code));

    let cancelled = false;
    void (async () => {
      try {
        setMessage('正在验证邀请…');
        postGenesis50BridgeMessage({ status: 'opening' });
        const target = await resolveGenesis50OpenUrl(href, { allowFallback: false });
        if (cancelled) return;
        setMessage('正在打开…');
        window.location.replace(target);
      } catch (e) {
        if (cancelled) return;
        console.warn('[genesis50-bridge]', e);
        const hint =
          e instanceof Error && e.message && e.message !== '自动进入失败'
            ? e.message
            : '网络或邀请验证未通过';
        postGenesis50BridgeMessage({
          status: 'error',
          message: hint,
        });
        setError(
          `未能自动进入活动（${hint}）。邀请码 ${code}，可重试或手动进入后在活动页填写。`,
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [search]);

  const displayTitle =
    inviteCampaignDisplayTitle(
      normalizeGenesis50Href(
        (search.get('href') || search.get('target') || '').trim(),
      ),
    );

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
          gap: 12,
        }}
      >
        <p style={{ margin: 0, lineHeight: 1.6 }}>{error}</p>
        {inviteCode ? (
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>
            邀请码：<strong>{inviteCode}</strong>
          </p>
        ) : null}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            width: '100%',
            maxWidth: 280,
            marginTop: 8,
          }}
        >
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => window.location.reload()}
          >
            重试自动进入
          </button>
          {manualHref ? (
            <button
              type="button"
              className="text-link"
              onClick={() => {
                postGenesis50BridgeMessage({ status: 'manual' });
                window.location.replace(manualHref);
              }}
            >
              手动进入活动
            </button>
          ) : null}
        </div>
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
        {displayTitle}
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
