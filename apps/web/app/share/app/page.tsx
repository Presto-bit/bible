import type { Metadata } from 'next';
import { BRAND_FULL, BRAND_NAME, BRAND_TAGLINE } from '@/lib/brand';
import {
  INVITE_CAPABILITIES,
  INVITE_CAPABILITY_TITLE,
  INVITE_LANDING_SUPPORT,
  INVITE_SHARE_TITLE,
} from '@/lib/invite_share';
import { analysisShareSiteOrigin } from '@/lib/analysis_share';
import { PWA_ICON_SOURCE, PWA_MANIFEST_DESCRIPTION } from '@/lib/pwa_brand';
import { withBasePath } from '@/lib/basePath';
import { SharePwaGuide } from '@/components/SharePwaGuide';
import { InviteAppClient } from './invite_client';

const TITLE = INVITE_SHARE_TITLE;
const DESCRIPTION = `${INVITE_LANDING_SUPPORT}。${BRAND_TAGLINE}`;

export async function generateMetadata(): Promise<Metadata> {
  const origin = analysisShareSiteOrigin();
  const ogImage = `${origin}${withBasePath(PWA_ICON_SOURCE)}`;

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
      images: [{ url: ogImage, width: 512, height: 512, alt: BRAND_NAME }],
    },
    twitter: {
      card: 'summary',
      title: TITLE,
      description: DESCRIPTION,
      images: [ogImage],
    },
  };
}

export default function InviteAppPage() {
  return (
    <main className="container invite-app-page">
      <SharePwaGuide variant="invite" />
      <p className="eyebrow">{BRAND_NAME}</p>
      <h1 className="invite-app-title">有人陪你读懂圣经</h1>
      <p className="invite-app-support">{INVITE_LANDING_SUPPORT}</p>
      <p className="muted invite-app-tagline">{BRAND_TAGLINE}</p>

      <InviteAppClient />

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

      <InviteAppClient showInstallSteps />

      <p className="muted" style={{ marginTop: 28, fontSize: 12 }}>
        可保存到主屏幕 · 登录后进度可同步
      </p>
    </main>
  );
}
