'use client';

import { Suspense } from 'react';
import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { StoryAlbumPlayer } from '@/components/story/StoryAlbumPlayer';
import { EXODUS_STORY } from '@/lib/exodus_series';

function PlayInner() {
  const params = useSearchParams();
  const { ep, beat } = useMemo(() => {
    const epRaw = Number(params.get('ep') || '0');
    const beatRaw = Number(params.get('beat') || '0');
    const ep = Number.isFinite(epRaw)
      ? Math.min(Math.max(0, Math.floor(epRaw)), EXODUS_STORY.episodes.length - 1)
      : 0;
    const beatsLen = EXODUS_STORY.episodes[ep]?.beats.length ?? 1;
    const beat = Number.isFinite(beatRaw)
      ? Math.min(Math.max(0, Math.floor(beatRaw)), Math.max(0, beatsLen - 1))
      : 0;
    return { ep, beat };
  }, [params]);

  return <StoryAlbumPlayer episodeIndex={ep} beatIndex={beat} />;
}

export default function ExodusStoryPlayPage() {
  return (
    <Suspense fallback={<main className="container"><p className="muted">正在打开故事…</p></main>}>
      <PlayInner />
    </Suspense>
  );
}
