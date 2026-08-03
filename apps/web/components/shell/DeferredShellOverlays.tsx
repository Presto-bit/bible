'use client';

import dynamic from 'next/dynamic';

/** 非首屏关键的壳层浮层：延后挂载，缩短冷启动主路径。 */
const InstallBanner = dynamic(() => import('@/components/InstallPwaGuide'), { ssr: false });
const InviteFriendNudge = dynamic(() => import('@/components/InviteFriendNudge'), { ssr: false });
const WebOnboardingSheet = dynamic(() => import('@/components/WebOnboardingSheet'), { ssr: false });
const PwaFirstOpenGuide = dynamic(() => import('@/components/PwaFirstOpenGuide'), { ssr: false });
const AndroidShellHealthGuide = dynamic(() => import('@/components/AndroidShellHealthGuide'), {
  ssr: false,
});
const ShareFunnelBootstrap = dynamic(() => import('@/components/ShareFunnelBootstrap'), { ssr: false });
const ExternalBrowserSheet = dynamic(() => import('@/components/ExternalBrowserSheet'), { ssr: false });
const ShellTouchGuard = dynamic(() => import('@/components/ShellTouchGuard'), { ssr: false });

export default function DeferredShellOverlays() {
  return (
    <>
      <ShellTouchGuard />
      <InstallBanner />
      <InviteFriendNudge />
      <WebOnboardingSheet />
      <PwaFirstOpenGuide />
      <AndroidShellHealthGuide />
      <ShareFunnelBootstrap />
      <ExternalBrowserSheet />
    </>
  );
}
