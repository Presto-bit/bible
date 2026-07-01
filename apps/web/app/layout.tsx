import type { Metadata, Viewport } from 'next';
import './globals.css';
import PwaRegister from '@/components/PwaRegister';
import StaleShellGuard from '@/components/StaleShellGuard';
import InstallBanner from '@/components/InstallBanner';
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
  themeColor: '#4f6b5d',
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
        <div className="app-body">{children}</div>
        <BottomTabs />
        <StaleShellGuard />
        <PwaRegister />
        <InstallBanner />
      </body>
    </html>
  );
}
