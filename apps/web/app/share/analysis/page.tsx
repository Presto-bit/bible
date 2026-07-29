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

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Search>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const { refLabel, lead } = parseAnalysisShareParams(paramBag(sp));
  const title = `${refLabel} · 一分钟解读`;
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
      <p className="eyebrow">{BRAND_NAME}</p>
      <h1 className="analysis-share-title">{parsed.refLabel}</h1>
      <p className="muted" style={{ marginTop: 4 }}>一分钟解读</p>
      <p className="analysis-share-lead">{parsed.lead}</p>
      <p className="muted analysis-share-disclaimer">
        内容由 AI 生成摘要，请以圣经原文为准。{BRAND_TAGLINE}
      </p>
      <AnalysisShareClient refLabel={parsed.refLabel} refParam={parsed.refParam} />
      <p className="muted" style={{ marginTop: 24 }}>
        <Link href="/" className="text-link">返回首页</Link>
      </p>
    </main>
  );
}
