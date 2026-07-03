import type { Metadata, Viewport } from 'next';
import './globals.css';
import PwaRegister from '@/components/PwaRegister';
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
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>
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
              <InstallBanner />
              <WebOnboardingSheet />
            </IdentityShell>
          </PasswordSheetProvider>
        </ConfirmProvider>
      </body>
    </html>
  );
}
