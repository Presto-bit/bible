'use client';

export default function ShelfBrandCover({ className = '' }: { className?: string }) {
  return (
    <div className={`shelf-brand-cover ${className}`.trim()} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/shelf-brand.svg" alt="" className="shelf-brand-cover-icon" draggable={false} />
    </div>
  );
}
