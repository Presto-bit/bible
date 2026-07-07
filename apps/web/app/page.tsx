'use client';

import HomePageClient from '@/components/HomePage';
import { useSuppressKeepAliveRoute } from '@/components/shell/TabKeepAliveContext';

export default function HomePage() {
  if (useSuppressKeepAliveRoute()) return null;
  return <HomePageClient />;
}
