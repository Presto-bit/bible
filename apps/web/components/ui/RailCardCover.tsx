'use client';

import { useState } from 'react';
import type { CardCover } from '@/lib/card_covers';

type Props = {
  cover: CardCover;
  variant?: 'action' | 'default' | 'thumb';
  priority?: boolean;
};

export function RailCardCover({ cover, variant = 'default', priority }: Props) {
  const [src, setSrc] = useState(cover.photo);

  return (
    <div className={`rail-card-cover rail-card-cover-${variant}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={cover.alt ?? ''}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        fetchPriority={priority ? 'high' : 'auto'}
        onError={() => {
          if (src !== cover.fallback) setSrc(cover.fallback);
        }}
      />
      <div className="rail-card-cover-scrim" aria-hidden />
    </div>
  );
}
