'use client';

export function SkeletonLine({ width = '100%' }: { width?: string | number }) {
  return <div className="skeleton-line" style={{ width }} aria-hidden />;
}

export function SkeletonCard() {
  return (
    <div className="skeleton-card" aria-hidden>
      <SkeletonLine width="40%" />
      <SkeletonLine width="88%" />
      <SkeletonLine width="72%" />
    </div>
  );
}

export function ReaderSkeleton() {
  return (
    <div className="reader-skeleton" aria-busy aria-label="加载中">
      {Array.from({ length: 8 }, (_, i) => (
        <SkeletonLine key={i} width={`${70 + (i % 3) * 10}%`} />
      ))}
    </div>
  );
}

/** 首页冷启骨架（仅无缓存时） */
export function HomeSkeleton() {
  return (
    <div className="home-skeleton" aria-busy aria-label="加载中">
      <div className="home-skeleton-hero" />
      <div className="home-skeleton-today">
        <div className="home-skeleton-primary" />
        <div className="home-skeleton-sides">
          <div className="home-skeleton-side" />
          <div className="home-skeleton-side" />
        </div>
      </div>
      <div className="home-skeleton-summary" />
    </div>
  );
}
