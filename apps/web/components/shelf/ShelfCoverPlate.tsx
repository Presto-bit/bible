'use client';

import { shelfCoverHue } from '@/lib/shelf_api';

export default function ShelfCoverPlate({
  title,
  subtitle,
  size = 'detail',
  coverUrl,
}: {
  title: string;
  subtitle?: string;
  size?: 'detail' | 'tile';
  coverUrl?: string | null;
}) {
  const hue = shelfCoverHue(title);
  const cls = size === 'detail' ? 'shelf-detail-cover' : 'shelf-cover';

  if (coverUrl) {
    return (
      <div className={`${cls} shelf-cover-has-image`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={coverUrl} alt="" className="shelf-cover-image" />
      </div>
    );
  }

  return (
    <div
      className={cls}
      style={{
        background: `linear-gradient(145deg, hsl(${hue} 42% 38%), hsl(${(hue + 36) % 360} 36% 28%))`,
      }}
    >
      <span className="shelf-cover-title">{title}</span>
      {subtitle ? <span className="shelf-cover-sub">{subtitle}</span> : null}
      <span className="shelf-cover-badge">平台</span>
    </div>
  );
}
