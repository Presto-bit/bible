'use client';

import ProfileTab from '@/components/tabs/ProfileTab';
import { useSuppressKeepAliveRoute } from '@/components/shell/TabKeepAliveContext';

export default function ProfilePage() {
  if (useSuppressKeepAliveRoute()) return null;
  return <ProfileTab />;
}
