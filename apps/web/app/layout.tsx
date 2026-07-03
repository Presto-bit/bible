import type { Metadata, Viewport } from 'next';
import '../styles/design_tokens.css';
import './globals.css';
import { AppThemeShell } from '@/components/AppThemeShell';
import PwaRegister from '@/components/PwaRegister';
import PwaStandaloneShell from '@/components/PwaStandaloneShell';
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
        {/* release.sh 健康检查锚点（须出现在 SSR HTML，勿删） */}
        <span hidden aria-hidden="true">
          每日问答
        </span>
        <ConfirmProvider>
          <PasswordSheetProvider>
            <IdentityShell>
              <AppThemeShell />
              <OfflineBar />
              <div className="app-body">{children}</div>
              <BottomTabs />
              <StaleShellGuard />
              <PwaRegister />
              <PwaStandaloneShell />
              <InstallBanner />
              <WebOnboardingSheet />
            </IdentityShell>
          </PasswordSheetProvider>
        </ConfirmProvider>
      </body>
    </html>
  );
}
