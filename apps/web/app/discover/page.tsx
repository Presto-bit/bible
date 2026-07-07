'use client';

import DiscoverTab from '@/components/tabs/DiscoverTab';
import { useSuppressKeepAliveRoute } from '@/components/shell/TabKeepAliveContext';

export default function DiscoverPage() {
  if (useSuppressKeepAliveRoute()) return null;
  return <DiscoverTab />;
}
