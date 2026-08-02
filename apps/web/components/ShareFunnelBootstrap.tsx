'use client';

/**
 * 分享漏斗：识别 fw=1，强化系统浏览器安装；记住装后深链。
 */

import { Suspense, useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { openPwaInstallSheet } from '@/components/InstallPwaGuide';
import { detectInstallPlatform } from '@/lib/pwa_platform';
import { isShareLandingPath } from '@/lib/share_pwa_guide';
import { bootstrapFromWechatParam, notePostInstallPath } from '@/lib/wechat_escape';

function ShareFunnelBootstrapInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const platform = detectInstallPlatform();
    const result = bootstrapFromWechatParam(searchParams);

    if (result.stripQuery && typeof window !== 'undefined') {
      const u = new URL(window.location.href);
      if (u.searchParams.has('fw')) {
        u.searchParams.delete('fw');
        router.replace(`${u.pathname}${u.search}${u.hash}`);
      }
    }

    if (isShareLandingPath(pathname)) {
      notePostInstallPath();
    }

    if (result.shouldBoostInstall && platform !== 'inapp' && platform !== 'standalone') {
      // 从微信逃出后尽快接上安装引导（iOS 指尖 / 安卓下载）
      const t = window.setTimeout(() => openPwaInstallSheet(), 380);
      return () => window.clearTimeout(t);
    }
  }, [pathname, searchParams, router]);

  return null;
}

export default function ShareFunnelBootstrap() {
  return (
    <Suspense fallback={null}>
      <ShareFunnelBootstrapInner />
    </Suspense>
  );
}
