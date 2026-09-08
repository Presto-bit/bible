import type { Metadata, Viewport } from 'next';
import '../styles/design_tokens.css';
import '../styles/brand_splash.css';
import './globals.css';
import '../styles/shared_chrome.css';
import '../styles/pwa_polish.css';
import { AppThemeShell } from '@/components/AppThemeShell';
import PwaRegister from '@/components/PwaRegister';
import PwaStandaloneShell from '@/components/PwaStandaloneShell';
import StaleShellGuard from '@/components/StaleShellGuard';
import IdentityShell from '@/components/IdentityShell';
import { ConfirmProvider } from '@/components/ui/ConfirmProvider';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { PasswordSheetProvider } from '@/components/ui/PasswordSheetProvider';
import OfflineBar from '@/components/OfflineBar';
import BottomTabs from '@/components/BottomTabs';
import TabKeepAlive from '@/components/shell/TabKeepAlive';
import DeferredShellOverlays from '@/components/shell/DeferredShellOverlays';
import SoftNavProgress from '@/components/shell/SoftNavProgress';
import SoftNavTransitionShell from '@/components/shell/SoftNavTransitionShell';
import BrandSplash from '@/components/shell/BrandSplash';
import ShellNavBridge from '@/components/ShellNavBridge';

import { BASE_PATH } from '@/lib/basePath';
import { BRAND_FULL } from '@/lib/brand';
import {
  IOS_STARTUP_FALLBACK,
  IOS_STARTUP_IMAGES,
  PWA_HOME_NAME,
  PWA_MANIFEST_DESCRIPTION,
  PWA_SHELL_BG_COLOR,
  PWA_SPLASH_BG_COLOR,
} from '@/lib/pwa_brand';
import { BRAND_SPLASH_SUBTITLE, BRAND_SPLASH_TITLE } from '@/lib/brand_splash';
import {
  brandSplashHeadBootstrapScript,
  brandSplashInlineArmScript,
  brandSplashInlineCriticalCss,
} from '@/lib/brand_splash_arm';
import ShellSplashReady from '@/components/shell/ShellSplashReady';
import { peiaiFontClassNames } from '@/lib/fonts';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://2sc.prestoai.cn'),
  title: BRAND_FULL,
  description: PWA_MANIFEST_DESCRIPTION,
  manifest: `${BASE_PATH || ''}/manifest.webmanifest`,
  openGraph: {
    type: 'website',
    locale: 'zh_CN',
    siteName: BRAND_FULL,
    title: BRAND_FULL,
    description: PWA_MANIFEST_DESCRIPTION,
    images: [{ url: `${BASE_PATH || ''}/icon-512.png`, width: 512, height: 512, alt: BRAND_FULL }],
  },
  twitter: {
    card: 'summary',
    title: BRAND_FULL,
    description: PWA_MANIFEST_DESCRIPTION,
    images: [`${BASE_PATH || ''}/icon-512.png`],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: PWA_HOME_NAME,
  },
  icons: {
    apple: [
      { url: `${BASE_PATH || ''}/apple-touch-icon.png`, sizes: '180x180' },
      { url: `${BASE_PATH || ''}/apple-touch-icon-167.png`, sizes: '167x167' },
    ],
  },
  other: {
    'app-version': process.env.NEXT_PUBLIC_APP_VERSION || 'dev',
    'mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
  themeColor: PWA_SHELL_BG_COLOR,
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  // 键盘弹出时缩小 layout viewport，避免 iOS/PWA fixed 底栏收起后悬空留白
  interactiveWidget: 'resizes-content',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const base = BASE_PATH || '';

  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || 'dev';

  return (
    <html
      lang="zh-CN"
      className={peiaiFontClassNames}
      style={{ backgroundColor: PWA_SHELL_BG_COLOR }}
      suppressHydrationWarning
    >
      <head>
        <meta name="app-version" content={appVersion} />
        {IOS_STARTUP_IMAGES.map(({ file, media }) => (
          <link
            key={file}
            rel="apple-touch-startup-image"
            href={`${base}/${file}`}
            media={media}
          />
        ))}
        <link rel="apple-touch-startup-image" href={`${base}/${IOS_STARTUP_FALLBACK}`} />
        <link rel="preload" href={`${base}/apple-touch-icon.png`} as="image" />
        <style
          dangerouslySetInnerHTML={{
            __html: brandSplashInlineCriticalCss(PWA_SPLASH_BG_COLOR),
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: brandSplashHeadBootstrapScript(),
          }}
        />
        {/* 安卓：尽早拦截浏览器「添加主屏幕」mini-infobar，改由 H5 推 APK */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var ua=navigator.userAgent||'';if(!/Android/i.test(ua))return;window.addEventListener('beforeinstallprompt',function(e){try{e.preventDefault();}catch(_){}},true);}catch(_){}})();`,
          }}
        />
      </head>
      <body style={{ backgroundColor: PWA_SHELL_BG_COLOR }}>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;if(s){document.documentElement.classList.add('pwa-standalone');document.body.classList.add('pwa-standalone');}}catch(_){}})();`,
          }}
        />
        <div
          id="peiai-brand-splash-ssr"
          className="peiai-brand-splash"
          aria-hidden="true"
          suppressHydrationWarning
          style={{ ['--peiai-brand-splash-bg' as string]: PWA_SPLASH_BG_COLOR }}
        >
          <div className="peiai-brand-splash-inner">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="peiai-brand-splash-icon"
              src={`${base}/apple-touch-icon.png`}
              alt=""
              width={120}
              height={120}
              decoding="sync"
            />
            <p className="peiai-brand-splash-title">{BRAND_SPLASH_TITLE}</p>
            <p className="peiai-brand-splash-sub">{BRAND_SPLASH_SUBTITLE}</p>
          </div>
        </div>
        <script
          dangerouslySetInnerHTML={{
            __html: brandSplashInlineArmScript(),
          }}
        />
        {/* release.sh 健康检查锚点（须出现在 SSR HTML，勿删） */}
        <span hidden aria-hidden="true">
          每日问答
        </span>
        <ConfirmProvider>
          <ToastProvider>
          <PasswordSheetProvider>
            <IdentityShell>
              <AppThemeShell />
              <OfflineBar />
              <SoftNavProgress />
              <SoftNavTransitionShell />
              <BrandSplash />
              <div className="app-body">
                <ShellSplashReady />
                <TabKeepAlive>{children}</TabKeepAlive>
              </div>
              <BottomTabs />
              <StaleShellGuard />
              <ShellNavBridge />
              <PwaRegister />
              <PwaStandaloneShell />
              <DeferredShellOverlays />
            </IdentityShell>
          </PasswordSheetProvider>
          </ToastProvider>
        </ConfirmProvider>
      </body>
    </html>
  );
}
