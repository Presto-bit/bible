'use client';

import { useEffect } from 'react';
import JourneyMap from '@/components/journey/JourneyMap';
import { markRouteNavigation, settleSoftSecondaryNav } from '@/lib/pwa_tab_nav';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';
import '@/styles/journey_map.css';

export default function ProfileJourneyPage() {
  useEdgeSwipeBack({ href: '/profile' });

  useEffect(() => {
    document.body.classList.add('journey-open');
    markRouteNavigation();
    settleSoftSecondaryNav();
    return () => document.body.classList.remove('journey-open');
  }, []);

  return (
    <main className="journey-page">
      <JourneyMap />
    </main>
  );
}
