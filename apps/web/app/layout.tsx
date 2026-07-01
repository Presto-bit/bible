import type { Metadata, Viewport } from 'next';
import './globals.css';
import PwaRegister from '@/components/PwaRegister';
import InstallBanner from '@/components/InstallBanner';
import BottomTabs from '@/components/BottomTabs';

import { BASE_PATH } from '@/lib/basePath';

export const metadata: Metadata = {
  title: 'PrestoAI 读经',
  description: '安静读经，遇见话语。AI 解经与默想陪伴。',
  manifest: `${BASE_PATH || ''}/manifest.webmanifest`,
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'PrestoAI 读经' },
  icons: {
    apple: `${BASE_PATH || ''}/apple-touch-icon.png`,
  },
};

export const viewport: Viewport = {
  themeColor: '#4f6b5d',
  width: 'device-width',
  initialScale: 1,
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
        <PwaRegister />
        <InstallBanner />
      </body>
    </html>
  );
}
