'use client';

import ReaderTab from '@/components/tabs/ReaderTab';
import { useSuppressKeepAliveRoute } from '@/components/shell/TabKeepAliveContext';

export default function ReaderPage() {
  if (useSuppressKeepAliveRoute()) return null;
  return <ReaderTab paneActive />;
}
