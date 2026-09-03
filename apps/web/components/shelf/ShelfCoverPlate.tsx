'use client';

import ShelfBrandCover from '@/components/shelf/ShelfBrandCover';

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
  const cls = size === 'detail' ? 'shelf-detail-cover' : 'shelf-book-card-cover';

  if (coverUrl) {
    return (
      <div className={`${cls} shelf-cover-has-image`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={coverUrl} alt="" className="shelf-book-card-image" />
      </div>
    );
  }

  return (
    <div className={cls}>
      <ShelfBrandCover />
    </div>
  );
}
