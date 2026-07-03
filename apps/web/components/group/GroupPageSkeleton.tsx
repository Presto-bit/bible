export function GroupPageSkeleton() {
  return (
    <div className="group-page-skeleton" aria-hidden>
      <div className="group-skeleton-nav" />
      <div className="group-skeleton-focus card card-2">
        <div className="group-skeleton-line w60" />
        <div className="group-skeleton-line w40" />
        <div className="group-skeleton-btn" />
      </div>
      <div className="group-skeleton-wall card card-2">
        <div className="group-skeleton-line w30" />
        <div className="group-skeleton-cards">
          <div className="group-skeleton-poster" />
          <div className="group-skeleton-poster" />
          <div className="group-skeleton-poster" />
        </div>
      </div>
    </div>
  );
}
