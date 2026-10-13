import type { Metadata } from 'next';
import { BRAND_FULL, BRAND_NAME, BRAND_TAGLINE } from '@/lib/brand';
import { formatDailyVerseQuote } from '@/lib/daily_verse_display';
import {
  INVITE_CAPABILITIES,
  INVITE_CAPABILITY_TITLE,
  INVITE_LANDING_SUPPORT,
  INVITE_SHARE_TITLE,
} from '@/lib/invite_share';
import { analysisShareSiteOrigin } from '@/lib/analysis_share';
import { PWA_MANIFEST_DESCRIPTION } from '@/lib/pwa_brand';
import { shareOgImageUrl } from '@/lib/share_og';
import { withShareInstallHint } from '@/lib/share_site';
import { SharePwaGuide } from '@/components/SharePwaGuide';

async function fetchTodayVerse(): Promise<{ ref: string; text: string }> {
  const apiBase = (process.env.NEXT_PUBLIC_API_BASE || 'https://2sc.prestoai.cn').replace(
    /\/$/,
    '',
  );
  try {
    const res = await fetch(`${apiBase}/content/daily-verse`, { next: { revalidate: 3600 } });
    if (!res.ok) return { ref: '', text: '' };
    const data = (await res.json()) as { ref?: string; text?: string };
    return { ref: (data.ref || '').trim(), text: (data.text || '').trim() };
  } catch {
    return { ref: '', text: '' };
  }
}

const TITLE = INVITE_SHARE_TITLE;
const DESCRIPTION = withShareInstallHint(`${INVITE_LANDING_SUPPORT}。${BRAND_TAGLINE}`);

export async function generateMetadata(): Promise<Metadata> {
  const origin = analysisShareSiteOrigin();
  const og = shareOgImageUrl(7);

  return {
    title: `${TITLE} | ${BRAND_NAME}`,
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

export default async function InviteAppPage() {
  const verse = await fetchTodayVerse();

  return (
    <main className="container share-landing-page invite-app-page">
      <SharePwaGuide variant="invite" />
      <p className="eyebrow">{BRAND_NAME}</p>
      <h1 className="share-landing-title invite-app-title">今日经文</h1>
      <p className="muted share-landing-support invite-app-tagline">{BRAND_TAGLINE}</p>
      {verse.text ? (
        <>
          <p className="share-landing-cite">{verse.ref || '每日经文'}</p>
          <blockquote className="share-landing-verse">
            <p className="share-landing-verse-text">{formatDailyVerseQuote(verse.text)}</p>
          </blockquote>
        </>
      ) : (
        <p className="share-landing-lead invite-app-support">{INVITE_LANDING_SUPPORT}</p>
      )}

      <section className="invite-app-section" aria-labelledby="invite-cap-title">
        <h2 id="invite-cap-title" className="invite-app-section-title">
          {INVITE_CAPABILITY_TITLE}
        </h2>
        <ul className="invite-app-caps">
          {INVITE_CAPABILITIES.map((item) => (
            <li key={item.title} className="invite-app-cap">
              <strong>{item.title}</strong>
              <span className="muted">{item.desc}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
