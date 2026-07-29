import type { Metadata } from 'next';
import { BRAND_FULL, BRAND_NAME, BRAND_TAGLINE } from '@/lib/brand';
import { analysisShareSiteOrigin } from '@/lib/analysis_share';
import { shareOgImageUrl } from '@/lib/share_og';
import { SharePwaGuide } from '@/components/SharePwaGuide';
import { WrappedShareClient } from './share_client';

type Search = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] || '';
  return v || '';
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Search>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const label = first(sp.label).trim() || '读经回顾';
  const highlight = first(sp.h).trim() || `我在${BRAND_NAME}的读经足迹`;
  const stats = first(sp.s).trim();
  const description = [highlight, stats].filter(Boolean).join(' · ').slice(0, 120);
  const origin = analysisShareSiteOrigin();
  const og = shareOgImageUrl(18);

  return {
    title: `${label}｜${BRAND_NAME}`,
    description: description || BRAND_TAGLINE,
    metadataBase: new URL(origin),
    openGraph: {
      type: 'website',
      locale: 'zh_CN',
      siteName: BRAND_FULL,
      title: `${label} · ${highlight}`.slice(0, 40),
      description: description || BRAND_TAGLINE,
      images: [{ url: og.url, width: og.width, height: og.height, alt: BRAND_NAME }],
    },
    twitter: {
      card: 'summary_large_image',
      title: label,
      description: description || BRAND_TAGLINE,
      images: [og.url],
    },
  };
}

export default async function WrappedSharePage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const period = first(sp.period) === 'year' ? 'year' : 'month';
  const label = first(sp.label).trim() || (period === 'year' ? '今年读经' : '本月读经');
  const highlight = first(sp.h).trim() || `我在${BRAND_NAME}留下了足迹`;
  const stats = first(sp.s).trim();

  return (
    <main className="container share-landing-page">
      <SharePwaGuide variant="wrapped" />
      <p className="eyebrow">{BRAND_NAME} · 读经回顾</p>
      <p className="muted share-landing-kicker">{label}</p>
      <h1 className="share-landing-title">{highlight}</h1>
      {stats ? <p className="share-landing-lead">{stats}</p> : null}
      <p className="muted share-landing-support">{BRAND_TAGLINE}</p>
      <WrappedShareClient period={period} />
    </main>
  );
}
