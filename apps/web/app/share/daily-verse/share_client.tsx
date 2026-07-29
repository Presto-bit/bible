'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { captureAcquisitionFromLocation } from '@/lib/acquisition';
import { api, type DailyVerse } from '@/lib/api';
import { BRAND_NAME, BRAND_TAGLINE } from '@/lib/brand';
import { formatDailyVerseQuote } from '@/lib/daily_verse_display';
import { openPwaInstallSheet } from '@/components/InstallPwaGuide';
import { detectInstallPlatform } from '@/lib/pwa_platform';

export function DailyVerseShareClient({ day }: { day?: number }) {
  const [verse, setVerse] = useState<DailyVerse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showInstallCta, setShowInstallCta] = useState(false);

  useEffect(() => {
    captureAcquisitionFromLocation();
    setShowInstallCta(detectInstallPlatform() !== 'standalone');
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
        <div className="share-landing-ctas daily-verse-share-ctas">
          <Link className="btn btn-primary" href="/">
            打开{BRAND_NAME}
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <p className="daily-verse-share-ref">{verse.ref || '每日经文'}</p>
      <blockquote className="daily-verse-share-quote">
        {formatDailyVerseQuote(verse.text)}
      </blockquote>
      <p className="muted daily-verse-share-meta">和合本 · {BRAND_TAGLINE}</p>

      <div className="share-landing-ctas daily-verse-share-ctas">
        {showInstallCta ? (
          <button type="button" className="btn btn-primary" onClick={() => openPwaInstallSheet()}>
            保存到主屏幕
          </button>
        ) : null}
        <Link className="btn" href="/">
          打开{BRAND_NAME}首页
        </Link>
        <Link className="btn btn-ghost" href="/reader">
          去读经
        </Link>
      </div>
    </>
  );
}
