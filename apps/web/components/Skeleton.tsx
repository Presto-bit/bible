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
