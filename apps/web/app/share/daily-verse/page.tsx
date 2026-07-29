import type { Metadata } from 'next';
import { BRAND_FULL, BRAND_NAME, BRAND_TAGLINE } from '@/lib/brand';
import { analysisShareSiteOrigin } from '@/lib/analysis_share';
import { PWA_ICON_SOURCE, PWA_MANIFEST_DESCRIPTION } from '@/lib/pwa_brand';
import { withBasePath } from '@/lib/basePath';
import { SharePwaGuide } from '@/components/SharePwaGuide';
import { DailyVerseShareClient } from './share_client';

type Search = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] || '';
  return v || '';
}

async function fetchVerseMeta(day?: number): Promise<{ ref: string; text: string }> {
  const apiBase = (process.env.NEXT_PUBLIC_API_BASE || 'https://2sc.prestoai.cn').replace(
    /\/$/,
    '',
  );
  const q = day != null && Number.isFinite(day) ? `?day=${day}` : '';
  try {
    const res = await fetch(`${apiBase}/content/daily-verse${q}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return { ref: '每日经文', text: '' };
    const data = (await res.json()) as { ref?: string; text?: string };
    return {
      ref: (data.ref || '').trim() || '每日经文',
      text: (data.text || '').trim(),
    };
  } catch {
    return { ref: '每日经文', text: '' };
  }
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Search>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const dayRaw = Number(first(sp.day));
  const day = Number.isFinite(dayRaw) && dayRaw > 0 ? dayRaw : undefined;
  const verse = await fetchVerseMeta(day);
  const title = `${verse.ref}｜${BRAND_NAME}每日经文`;
  const description =
    verse.text.slice(0, 120) || `${BRAND_TAGLINE}。${PWA_MANIFEST_DESCRIPTION}`;
  const origin = analysisShareSiteOrigin();
  const ogImage = `${origin}${withBasePath(PWA_ICON_SOURCE)}`;

  return {
    title,
    description,
    metadataBase: new URL(origin),
    openGraph: {
      type: 'website',
      locale: 'zh_CN',
      siteName: BRAND_FULL,
      title,
      description,
      images: [{ url: ogImage, width: 512, height: 512, alt: BRAND_NAME }],
    },
    twitter: {
      card: 'summary',
      title,
      description,
      images: [ogImage],
    },
    other: {
      'wechat:title': title,
      'wechat:description': description,
    },
  };
}

export default async function DailyVerseSharePage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const dayRaw = Number(first(sp.day));
  const day = Number.isFinite(dayRaw) && dayRaw > 0 ? dayRaw : undefined;

  return (
    <main className="container daily-verse-share-page">
      <SharePwaGuide variant="daily" />
      <p className="eyebrow">{BRAND_NAME}</p>
      <h1 className="daily-verse-share-title">今日经文</h1>
      <p className="muted daily-verse-share-support">来自朋友的分享 · {BRAND_TAGLINE}</p>
      <DailyVerseShareClient day={day} />
    </main>
  );
}
