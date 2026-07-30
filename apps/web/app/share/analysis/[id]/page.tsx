import type { Metadata } from 'next';
import { BRAND_FULL, BRAND_NAME, BRAND_TAGLINE } from '@/lib/brand';
import { analysisShareSiteOrigin } from '@/lib/analysis_share';
import { PWA_MANIFEST_DESCRIPTION } from '@/lib/pwa_brand';
import { shareOgImageUrl } from '@/lib/share_og';
import { AnalysisShareClient } from '../share_client';
import { SharePwaGuide } from '@/components/SharePwaGuide';
import type { Citation } from '@/lib/api';

type Snap = {
  id: string;
  ref_label: string;
  ref_param: string;
  lead: string;
  answer_markdown: string;
  citations: Citation[];
};

function apiBase(): string {
  return (
    process.env.API_INTERNAL_BASE ||
    process.env.NEXT_PUBLIC_API_BASE ||
    'https://2sc.prestoai.cn'
  );
}

async function loadSnapshot(id: string): Promise<Snap | null> {
  try {
    const res = await fetch(`${apiBase()}/ai/analysis-share/${encodeURIComponent(id)}`, {
      cache: 'no-store',
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;
    return (await res.json()) as Snap;
  } catch {
    return null;
  }
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
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const snap = await loadSnapshot(id);
  const refLabel = snap?.ref_label || '小爱的解读';
  const lead = snap?.lead || PWA_MANIFEST_DESCRIPTION;
  const title = ogTitle(refLabel, lead);
  const description = lead.slice(0, 120) || PWA_MANIFEST_DESCRIPTION;
  const origin = analysisShareSiteOrigin();
  const og = shareOgImageUrl(3);

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
      images: [{ url: og.url, width: og.width, height: og.height, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [og.url],
    },
  };
}

export default async function AnalysisShareSnapshotPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const snap = await loadSnapshot(id);

  if (!snap) {
    return (
      <main className="container share-landing-page analysis-share-page">
        <SharePwaGuide />
        <p className="eyebrow">{BRAND_NAME} · 小爱解读</p>
        <h1 className="share-landing-title analysis-share-title">分享不存在或已过期</h1>
        <p className="muted analysis-share-lead">请让分享者重新分享，或打开小爱自行提问。</p>
        <p className="muted analysis-share-disclaimer">{BRAND_TAGLINE}</p>
      </main>
    );
  }

  return (
    <main className="container share-landing-page analysis-share-page">
      <SharePwaGuide />
      <p className="eyebrow">{BRAND_NAME} · 小爱解读</p>
      <h1 className="share-landing-title analysis-share-title">{snap.ref_label}</h1>
      {snap.lead ? (
        <p className="share-landing-lead analysis-share-lead">{snap.lead}</p>
      ) : null}
      <AnalysisShareClient
        refLabel={snap.ref_label}
        refParam={snap.ref_param}
        answerMarkdown={snap.answer_markdown}
        citations={snap.citations || []}
        snapshotId={snap.id}
      />
      <p className="muted analysis-share-disclaimer">
        内容由 AI 生成，请以圣经原文为准。{BRAND_TAGLINE}
      </p>
    </main>
  );
}
