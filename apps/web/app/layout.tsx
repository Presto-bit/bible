import type { Metadata, Viewport } from 'next';
import './globals.css';
import PwaRegister from '@/components/PwaRegister';
import PwaStandaloneShell from '@/components/PwaStandaloneShell';
import PwaSplash from '@/components/PwaSplash';
import StaleShellGuard from '@/components/StaleShellGuard';
import InstallBanner from '@/components/InstallBanner';
import IdentityShell from '@/components/IdentityShell';
import { ConfirmProvider } from '@/components/ui/ConfirmProvider';
import { PasswordSheetProvider } from '@/components/ui/PasswordSheetProvider';
import OfflineBar from '@/components/OfflineBar';
import WebOnboardingSheet from '@/components/WebOnboardingSheet';
import BottomTabs from '@/components/BottomTabs';

import { BASE_PATH } from '@/lib/basePath';
import { BRAND_FULL, BRAND_TAGLINE } from '@/lib/brand';

export const metadata: Metadata = {
  title: BRAND_FULL,
  description: BRAND_TAGLINE,
  manifest: `${BASE_PATH || ''}/manifest.webmanifest`,
  appleWebApp: { capable: true, statusBarStyle: 'default', title: BRAND_FULL },
  icons: {
    apple: `${BASE_PATH || ''}/apple-touch-icon.png`,
  },
  other: {
    'app-version': process.env.NEXT_PUBLIC_APP_VERSION || 'dev',
  },
};

export const viewport: Viewport = {
  themeColor: '#fffcfa',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const icon192 = `${BASE_PATH || ''}/icon-192.png`;
  const splashIos = `${BASE_PATH || ''}/splash-ios.png`;

  return (
    <html lang="zh-CN">
      <head>
        <link
          rel="apple-touch-startup-image"
          href={splashIos}
          media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
        />
        <link
          rel="apple-touch-startup-image"
          href={splashIos}
          media="(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
        />
        <link
          rel="apple-touch-startup-image"
          href={splashIos}
          media="(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
        />
        <link rel="apple-touch-startup-image" href={splashIos} />
      </head>
      <body>
        <div id="pwa-splash" aria-hidden="true">
          <div className="pwa-splash-inner">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={icon192} alt="" width={128} height={128} decoding="sync" fetchPriority="high" />
            <strong className="pwa-splash-brand">彼爱</strong>
            <div className="pwa-splash-motto" aria-hidden="true">
              <span className="pwa-splash-motto-pi">彼</span>
              <span className="pwa-splash-motto-ci">此</span>
              <span className="pwa-splash-motto-xiang">相</span>
              <span className="pwa-splash-motto-ai">爱</span>
            </div>
          </div>
        </div>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;if(s){document.documentElement.classList.add('pwa-launch');}else{var el=document.getElementById('pwa-splash');if(el)el.remove();}}catch(e){var el2=document.getElementById('pwa-splash');if(el2)el2.remove();}})();`,
          }}
        />
        {/* release.sh 健康检查锚点（须出现在 SSR HTML，勿删） */}
        <span hidden aria-hidden="true">
          每日问答
        </span>
        <ConfirmProvider>
          <PasswordSheetProvider>
            <IdentityShell>
              <OfflineBar />
              <div className="app-body">{children}</div>
              <BottomTabs />
              <StaleShellGuard />
              <PwaRegister />
              <PwaStandaloneShell />
              <PwaSplash />
              <InstallBanner />
              <WebOnboardingSheet />
            </IdentityShell>
          </PasswordSheetProvider>
        </ConfirmProvider>
      </body>
    </html>
  );
}
