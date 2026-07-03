import type { CSSProperties } from 'react';

type Props = {
  pct: number;
  label?: string;
  size?: number;
  className?: string;
};

/** 打卡率 / 进度小环（群页与首页 rail 共用） */
export function StatRing({ pct, label, size = 52, className = '' }: Props) {
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <div
      className={`stat-ring ${className}`.trim()}
      style={{ '--pct': clamped, '--ring-size': `${size}px` } as CSSProperties}
      aria-hidden={!label}
      aria-label={label ? `${label} ${clamped}%` : undefined}
    >
      <span className="stat-ring-pct">{clamped}%</span>
      {label && <span className="stat-ring-label">{label}</span>}
    </div>
  );
}
