import type { Metadata } from 'next';
import Link from 'next/link';
import { BRAND_FULL, BRAND_NAME, BRAND_TAGLINE } from '@/lib/brand';
import {
  analysisShareSiteOrigin,
  parseAnalysisShareParams,
} from '@/lib/analysis_share';
import { PWA_ICON_SOURCE, PWA_MANIFEST_DESCRIPTION } from '@/lib/pwa_brand';
import { withBasePath } from '@/lib/basePath';
import { AnalysisShareClient } from './share_client';
import { SharePwaGuide } from '@/components/SharePwaGuide';

type Search = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] || '';
  return v || '';
}

function paramBag(searchParams: Search) {
  return {
    get(name: string) {
      return first(searchParams[name]) || null;
    },
  };
}

function ogTitle(refLabel: string, lead: string): string {
  const ref =
    !refLabel || refLabel === 'FREE' || refLabel === '小爱的解读'
      ? BRAND_NAME
      : refLabel;
  const insight = lead.replace(/\s+/g, ' ').trim().slice(0, 16);
  if (!insight) return `${ref}｜一分钟解读`;
  return `${ref}｜${insight}`;
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Search>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const { refLabel, lead } = parseAnalysisShareParams(paramBag(sp));
  const title = ogTitle(refLabel, lead);
  const description = lead.slice(0, 120) || PWA_MANIFEST_DESCRIPTION;
  const origin = analysisShareSiteOrigin();
  const ogImage = `${origin}${withBasePath(PWA_ICON_SOURCE)}`;

  return {
    title: `${title} | ${BRAND_NAME}`,
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

export default async function AnalysisSharePage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const parsed = parseAnalysisShareParams(paramBag(sp));

  return (
    <main className="container analysis-share-page">
      <SharePwaGuide />
      <p className="eyebrow">{BRAND_NAME}</p>
      <h1 className="analysis-share-title">{parsed.refLabel}</h1>
      <p className="analysis-share-lead">{parsed.lead}</p>
      <AnalysisShareClient
        refLabel={parsed.refLabel}
        refParam={parsed.refParam}
        more={parsed.more}
      />
      <p className="muted analysis-share-disclaimer">
        内容由 AI 生成，请以圣经原文为准。{BRAND_TAGLINE}
      </p>
      <p className="muted" style={{ marginTop: 16 }}>
        <Link href="/" className="text-link">返回首页</Link>
      </p>
    </main>
  );
}
