import type { Metadata } from 'next';
import Link from 'next/link';
import { BRAND_FULL, BRAND_NAME, BRAND_TAGLINE } from '@/lib/brand';
import { analysisShareSiteOrigin } from '@/lib/analysis_share';
import { shareOgImageUrl } from '@/lib/share_og';
import { withShareInstallHint } from '@/lib/share_site';
import { SharePwaGuide } from '@/components/SharePwaGuide';
import { CampaignShareClient } from './share_client';

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
  const title = first(sp.t).trim() || '群活动邀请';
  const body = first(sp.b).trim() || `来${BRAND_NAME}一起参加活动`;
  const day = Number(first(sp.day)) || 12;
  const origin = analysisShareSiteOrigin();
  const og = shareOgImageUrl(day);
  const description = withShareInstallHint(body.slice(0, 90));

  return {
    title: `${title}｜${BRAND_NAME}`,
    description,
    metadataBase: new URL(origin),
    openGraph: {
      type: 'website',
      locale: 'zh_CN',
      siteName: BRAND_FULL,
      title,
      description,
      images: [{ url: og.url, width: og.width, height: og.height, alt: BRAND_NAME }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [og.url],
    },
  };
}

export default async function CampaignSharePage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const id = first(sp.id).trim();
  const title = first(sp.t).trim() || '群活动';
  const body = first(sp.b).trim();
  const dayRaw = Number(first(sp.day));
  const day = Number.isFinite(dayRaw) && dayRaw > 0 ? dayRaw : undefined;

  return (
    <main className="container share-landing-page">
      <SharePwaGuide variant="campaign" />
      <p className="eyebrow">{BRAND_NAME} · 活动</p>
      <h1 className="share-landing-title">{title}</h1>
      {body ? <p className="share-landing-lead">{body}</p> : null}
      <p className="muted share-landing-support">{BRAND_TAGLINE}</p>
      <CampaignShareClient campaignId={id} day={day} />
      {!id ? (
        <p className="muted" style={{ marginTop: 16 }}>
          <Link href="/" className="text-link">返回首页</Link>
        </p>
      ) : null}
    </main>
  );
}
