'use client';

/**
 * 分享漏斗：fw=1、逃逸进系统浏览器 → 统一安装页；记住装后深链。
 */

import { Suspense, useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { detectInstallPlatform } from '@/lib/pwa_platform';
import { isShareLandingPath } from '@/lib/share_pwa_guide';
import {
  buildShareInstallHubUrl,
  isShareInstallHubLanding,
  sharePathForInstallNext,
  SHARE_INSTALL_NEXT_PARAM,
} from '@/lib/share_install_hub';
import { bootstrapFromWechatParam, notePostInstallPath } from '@/lib/wechat_escape';

function ShareFunnelBootstrapInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const redirectedRef = useRef(false);

  useEffect(() => {
    const platform = detectInstallPlatform();
    const fwPresent = searchParams.get('fw') === '1' || searchParams.get('fw') === 'true';
    const result = bootstrapFromWechatParam(searchParams);
    const shouldHub =
      platform !== 'inapp'
      && platform !== 'standalone'
      && (result.shouldBoostInstall || fwPresent)
      && isShareLandingPath(pathname)
      && !isShareInstallHubLanding(pathname);

    if (shouldHub && !redirectedRef.current) {
      redirectedRef.current = true;
      const next = sharePathForInstallNext(
        pathname,
        typeof window !== 'undefined' ? window.location.search : '',
      );
      notePostInstallPath(next);
      router.replace(buildShareInstallHubUrl(next));
      return;
    }

    if (
      result.stripQuery
      && platform !== 'inapp'
      && typeof window !== 'undefined'
    ) {
      const u = new URL(window.location.href);
      if (u.searchParams.has('fw')) {
        u.searchParams.delete('fw');
        const next = `${u.pathname}${u.search}${u.hash}`;
        window.history.replaceState(window.history.state, '', next);
      }
    }

    if (isShareLandingPath(pathname)) {
      const nextParam = searchParams.get(SHARE_INSTALL_NEXT_PARAM);
      notePostInstallPath(
        isShareInstallHubLanding(pathname) && nextParam
          ? nextParam
          : undefined,
      );
    }
  }, [pathname, router, searchParams]);

  return null;
}

export default function ShareFunnelBootstrap() {
  return (
    <Suspense fallback={null}>
      <ShareFunnelBootstrapInner />
    </Suspense>
  );
}