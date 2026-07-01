import type { Metadata, Viewport } from 'next';
import './globals.css';
import PwaRegister from '@/components/PwaRegister';
import InstallBanner from '@/components/InstallBanner';
import BottomTabs from '@/components/BottomTabs';

export const metadata: Metadata = {
  title: 'PrestoAI 读经',
  description: '安静读经，遇见话语。AI 解经与默想陪伴。',
  manifest: '/2sc/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'PrestoAI 读经' },
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
