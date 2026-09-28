import type { Metadata } from 'next';
import { BRAND_FULL, BRAND_NAME, BRAND_TAGLINE } from '@/lib/brand';
import { analysisShareSiteOrigin } from '@/lib/analysis_share';
import { PWA_MANIFEST_DESCRIPTION } from '@/lib/pwa_brand';
import { shareOgImageUrl } from '@/lib/share_og';
import { withShareInstallHint } from '@/lib/share_site';
import {
  SHELF_SHARE_LANDING_SUPPORT,
  SHELF_SHARE_LANDING_TITLE,
} from '@/lib/shelf_share';
import { SharePwaGuide } from '@/components/SharePwaGuide';
import { ShelfShareClient } from './share_client';

type Params = Promise<{ id: string }>;

async function fetchBookMeta(bookId: string): Promise<{
  title: string;
  subtitle: string;
  author: string;
}> {
  const apiBase = (process.env.NEXT_PUBLIC_API_BASE || 'https://2sc.prestoai.cn').replace(
    /\/$/,
    '',
  );
  try {
    const res = await fetch(`${apiBase}/shelf/platform/${encodeURIComponent(bookId)}`, {
      next: { revalidate: 600 },
    });
    if (!res.ok) {
      return { title: '推荐书目', subtitle: '', author: '' };
    }
    const data = (await res.json()) as {
      title?: string;
      subtitle?: string;
      author?: string;
    };
    return {
      title: sanitizeBookTitle((data.title || '').trim()),
      subtitle: (data.subtitle || '').trim(),
      author: (data.author || '').trim(),
    };
  } catch {
    return { title: '推荐书目', subtitle: '', author: '' };
  }
}

function sanitizeBookTitle(title: string): string {
  if (!title) return '推荐书目';
  const stem = title.includes('.') ? title.replace(/\.[^.]+$/, '') : title;
  if (/^shelf-[0-9a-f]{8,}$/i.test(stem)) return '推荐书目';
  return title;
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { id } = await params;
  const book = await fetchBookMeta(id);
  const title = `《${book.title}》｜${BRAND_NAME}`;
  const meta = [book.author ? `作者 ${book.author}` : '', book.subtitle]
    .filter(Boolean)
    .join(' · ');
  const description = withShareInstallHint(
    meta || `${SHELF_SHARE_LANDING_SUPPORT}。${BRAND_TAGLINE}` || PWA_MANIFEST_DESCRIPTION,
  );
  const origin = analysisShareSiteOrigin();
  const og = shareOgImageUrl(6);

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
      images: [{ url: og.url, width: og.width, height: og.height, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [og.url],
    },
    other: {
      'wechat:title': title,
      'wechat:description': description,
    },
  };
}

export default async function ShelfSharePage({ params }: { params: Params }) {
  const { id } = await params;

  return (
    <main className="container share-landing-page shelf-share-page">
      <SharePwaGuide variant="shelf" />
      <p className="eyebrow">{BRAND_NAME}</p>
      <h1 className="share-landing-title shelf-share-title">{SHELF_SHARE_LANDING_TITLE}</h1>
      <p className="muted share-landing-support shelf-share-support">
        {SHELF_SHARE_LANDING_SUPPORT}
      </p>
      <ShelfShareClient bookId={id} />
    </main>
  );
}
