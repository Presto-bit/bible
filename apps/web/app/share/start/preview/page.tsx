import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ShareInstallHubClient } from '@/components/ShareInstallHubClient';
import { SharePwaGuide } from '@/components/SharePwaGuide';
import { BRAND_NAME } from '@/lib/brand';

export const metadata: Metadata = {
  title: `统一安装页预览 | ${BRAND_NAME}`,
  robots: { index: false, follow: false },
};

export default function ShareInstallHubPreviewPage() {
  return (
    <>
      <SharePwaGuide variant="invite" />
      <Suspense fallback={null}>
        <ShareInstallHubClient />
      </Suspense>
    </>
  );
}