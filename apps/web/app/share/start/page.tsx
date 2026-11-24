import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ShareInstallHubClient } from '@/components/ShareInstallHubClient';
import { SharePwaGuide } from '@/components/SharePwaGuide';
import { BRAND_FULL, BRAND_NAME, BRAND_TAGLINE } from '@/lib/brand';
import { analysisShareSiteOrigin } from '@/lib/analysis_share';
import { PWA_MANIFEST_DESCRIPTION } from '@/lib/pwa_brand';
import { shareOgImageUrl } from '@/lib/share_og';
import { withShareInstallHint } from '@/lib/share_site';

const TITLE = `${BRAND_NAME} · 安装到手机`;
const DESCRIPTION = withShareInstallHint(
  `把${BRAND_NAME}装到桌面：${BRAND_TAGLINE}。读经、小爱、共读，iOS 与安卓/鸿蒙。`,
);

export async function generateMetadata(): Promise<Metadata> {
  const origin = analysisShareSiteOrigin();
  const og = shareOgImageUrl(7);

  return {
    title: `${TITLE}`,
    description: DESCRIPTION || PWA_MANIFEST_DESCRIPTION,
    metadataBase: new URL(origin),
    openGraph: {
      type: 'website',
      locale: 'zh_CN',
      siteName: BRAND_FULL,
      title: TITLE,
      description: DESCRIPTION,
      images: [{ url: og.url, width: og.width, height: og.height, alt: BRAND_NAME }],
    },
    twitter: {
      card: 'summary_large_image',
      title: TITLE,
      description: DESCRIPTION,
      images: [og.url],
    },
  };
}

export default function ShareInstallHubPage() {
  return (
  <>
      <SharePwaGuide variant="invite" />
      <Suspense fallback={null}>
        <ShareInstallHubClient />
      </Suspense>
    </>
  );
}