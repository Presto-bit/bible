import Link from 'next/link';

/** 发现页统一的建群 / 邀请码入口 */
export function DiscoverGroupActions({ className }: { className?: string }) {
  return (
    <div className={`discover-hero-actions${className ? ` ${className}` : ''}`}>
      <Link className="discover-action-btn discover-action-primary" href="/discover/join">
        <span className="discover-action-icon" aria-hidden>🔑</span>
        加入群
      </Link>
      <Link className="discover-action-btn discover-action-secondary" href="/group/create">
        <span className="discover-action-icon" aria-hidden>👥</span>
        创建群
      </Link>
    </div>
  );
}
