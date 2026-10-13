'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { captureAcquisitionFromLocation } from '@/lib/acquisition';
import { api, type DailyVerse } from '@/lib/api';
import { BRAND_NAME } from '@/lib/brand';
import { dailyVerseReaderHref, formatDailyVerseQuote } from '@/lib/daily_verse_display';
import { dailyVerseWallpaperUrl } from '@/lib/daily_verse_wallpaper';
import WallpaperBg from '@/components/home/WallpaperBg';
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
    return <p className="muted daily-verse-real-loading">正在打开今日经文…</p>;
  }

  if (err || !verse?.text) {
    return (
      <>
        <p className="muted">{err || '暂时无法加载经文'}</p>
        <ShareLandingCtas
          preferContentPrimary
          contentPrimary={{
            label: '进入首页',
            onClick: () => {
              window.location.assign('/');
            },
          }}
          secondary={[{ href: '/', label: `打开${BRAND_NAME}` }]}
        />
      </>
    );
  }

  const readerHref = dailyVerseReaderHref(verse);
  const wallpaper = dailyVerseWallpaperUrl(verse.day, 'full');

  return (
    <section className="daily-verse-real" aria-label={verse.ref || '每日经文'}>
      <WallpaperBg src={wallpaper} className="daily-verse-real-bg" fetchPriority="high" alt="" />
      <div className="daily-verse-real-scrim" aria-hidden />
      <Link href={readerHref || '/'} className="daily-verse-real-copy">
        <p className="daily-verse-real-kicker">每日经文</p>
        <p className="daily-verse-real-text">{formatDailyVerseQuote(verse.text)}</p>
        {verse.ref ? <p className="daily-verse-real-ref">{verse.ref}</p> : null}
      </Link>
      <div className="daily-verse-real-enter">
        <Link className="btn btn-primary" href="/">
          进入首页
        </Link>
        {readerHref ? (
          <Link className="btn daily-verse-real-read" href={readerHref}>
            阅读这节
          </Link>
        ) : null}
      </div>
    </section>
  );
}
