'use client';

import { PWA_ICON_SOURCE, PWA_SPLASH_BG_COLOR } from '@/lib/pwa_brand';

export default function ShelfBrandCover({ className = '' }: { className?: string }) {
  return (
    <div
      className={`shelf-brand-cover ${className}`.trim()}
      style={{ background: PWA_SPLASH_BG_COLOR }}
      aria-hidden
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={PWA_ICON_SOURCE} alt="" className="shelf-brand-cover-icon" draggable={false} />
    </div>
  );
}
