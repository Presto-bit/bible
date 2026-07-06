'use client';

import AssistantTab from '@/components/tabs/AssistantTab';
import { useSuppressKeepAliveRoute } from '@/components/shell/TabKeepAliveContext';

export default function AssistantPage() {
  if (useSuppressKeepAliveRoute()) return null;
  return <AssistantTab paneActive />;
}
