'use client';

import { useEffect, useState } from 'react';
import { captureAcquisitionFromLocation } from '@/lib/acquisition';
import { api, type DailyVerse } from '@/lib/api';
import { BRAND_NAME, BRAND_TAGLINE } from '@/lib/brand';
import { formatDailyVerseQuote } from '@/lib/daily_verse_display';
import { ShareLandingCtas } from '@/components/ShareLandingCtas';

export function DailyVerseShareClient({ day }: { day?: number }) {
  const [verse, setVerse] = useState<DailyVerse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    captureAcquisitionFromLocation();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void api
      .dailyVerse(day)
      .then((v) => {
        if (!cancelled) {
          setVerse(v);
          setErr(null);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : '加载失败');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [day]);

  if (loading) {
    return <p className="muted">正在打开今日经文…</p>;
  }

  if (err || !verse?.text) {
    return (
      <>
        <p className="muted">{err || '暂时无法加载经文'}</p>
        <ShareLandingCtas
          secondary={[
            { href: '/', label: `打开${BRAND_NAME}` },
          ]}
        />
      </>
    );
  }

  return (
    <>
      <p className="share-landing-cite daily-verse-share-ref">{verse.ref || '每日经文'}</p>
      <blockquote className="share-landing-verse">
        <p className="share-landing-verse-text">{formatDailyVerseQuote(verse.text)}</p>
      </blockquote>
      <p className="muted share-landing-support daily-verse-share-meta">和合本 · {BRAND_TAGLINE}</p>

      <ShareLandingCtas
        installLabel="保存到主屏幕"
        secondary={[
          { href: '/', label: `打开${BRAND_NAME}首页` },
          { href: '/reader', label: '去读经' },
        ]}
      />
    </>
  );
}
