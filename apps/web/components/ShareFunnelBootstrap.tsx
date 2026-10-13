'use client';

/**
 * 分享漏斗：识别 fw=1，记住装后深链，静默去掉参数。
 * 安装/添加到主屏幕由落地页自己的提示承担，这里不再弹第二层。
 */

import { Suspense, useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { detectInstallPlatform } from '@/lib/pwa_platform';
import { isShareLandingPath } from '@/lib/share_pwa_guide';
import { bootstrapFromWechatParam, notePostInstallPath } from '@/lib/wechat_escape';

function ShareFunnelBootstrapInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const platform = detectInstallPlatform();
    const result = bootstrapFromWechatParam(searchParams);

    // 微信内必须保留 ?fw=1，供「在浏览器打开」带参；系统浏览器落地后静默剥掉，不整页再跳一次
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
      notePostInstallPath();
    }
  }, [pathname, searchParams]);

  return null;
}

export default function ShareFunnelBootstrap() {
  return (
    <Suspense fallback={null}>
      <ShareFunnelBootstrapInner />
    </Suspense>
  );
}
