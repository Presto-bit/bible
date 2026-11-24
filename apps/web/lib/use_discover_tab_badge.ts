'use client';

import { useEffect, useState } from 'react';
import { clientDefaultsFallback, fetchClientDefaults } from '@/lib/client_defaults';
import { formatDiscoverTabBadge } from '@/lib/discover_unread';
import { useDiscoverUnread } from '@/lib/use_discover_unread';

/** 底栏「发现」角标：尊重 client-defaults，与会话未读条数同源。 */
export function useDiscoverTabBadge(): string | null {
  const count = useDiscoverUnread();
  const [enabled, setEnabled] = useState(
    clientDefaultsFallback().discover.tab_bar_unread_badge,
  );

  useEffect(() => {
    void fetchClientDefaults().then((d) => {
      setEnabled(d.discover.tab_bar_unread_badge);
    });
  }, []);

  if (!enabled) return null;
  return formatDiscoverTabBadge(count);
}