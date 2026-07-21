/** 首页横滑卡：统一 24×24 线性图标（stroke 1.75，圆角端点） */
import type { RailIconId } from '@/lib/home_rail';

export type { RailIconId };

type Props = {
  id: RailIconId;
  size?: number;
  className?: string;
};

const STROKE = 1.75;

function IconPaths({ id }: { id: RailIconId }) {
  switch (id) {
    case 'resume':
      return (
        <>
          <path d="M6 5.5h9a2 2 0 0 1 2 2v11a2 2 0 0 0-2-2H6V5.5z" />
          <path d="M6 5.5v13" />
          <path d="M9 9h4M9 12h3" />
        </>
      );
    case 'plan':
    case 'plans':
    case 'devotional':
      return (
        <>
          <rect x="5" y="6" width="14" height="13" rx="2" />
          <path d="M8 4.5v3M16 4.5v3M5 10.5h14" />
          <circle cx="12" cy="15" r="1.2" fill="currentColor" stroke="none" />
        </>
      );
    case 'prayer':
      return (
        <>
          <path d="M12 4.5v3.5" />
          <path d="M8.5 8c0-2 1.6-3.5 3.5-3.5s3.5 1.5 3.5 3.5" />
          <path d="M7 10.5 12 19l5-8.5" />
          <path d="M9.5 14h5" />
        </>
      );
    case 'group':
    case 'discover':
      /* 一书两人：左右简化头像/肩线 + 中间打开的书 */
      return (
        <>
          <circle cx="5.2" cy="7.2" r="2" />
          <path d="M2.8 13.2c.6-2.1 1.9-3.3 3.5-3.3" />
          <path d="M12 8.2 7 10.2v7.2L12 15.2" />
          <path d="M12 8.2 17 10.2v7.2L12 15.2" />
          <path d="M12 8.2v7" />
          <circle cx="18.8" cy="7.2" r="2" />
          <path d="M21.2 13.2c-.6-2.1-1.9-3.3-3.5-3.3" />
        </>
      );
    case 'notes':
      return (
        <>
          <path d="M8 5.5h8a2 2 0 0 1 2 2v11H8a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z" />
          <path d="M10 10h6M10 13.5h4.5M10 17h3" />
        </>
      );
    case 'suggest':
      return (
        <>
          <path d="M12 3.5a5.5 5.5 0 0 0-2.2 10.5v2.2l2.2-1.2 2.2 1.2v-2.2A5.5 5.5 0 0 0 12 3.5z" />
          <path d="M9.5 18.5h5" />
        </>
      );
    case 'assistant':
      return (
        <>
          <path d="M12 3.5 13.4 8.6 18.5 10 13.4 11.4 12 16.5 10.6 11.4 5.5 10 10.6 8.6z" />
          <path d="M18 5l.9 1.9L21 7.8l-2.1 1-.9 1.9-.9-1.9L15 7.8l2.1-.9z" />
        </>
      );
    case 'challenge':
      return (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="M8.2 12.2 10.8 14.8 15.8 9.2" />
        </>
      );
    default:
      return <circle cx="12" cy="12" r="6" />;
  }
}

export function RailLineIcon({ id, size = 22, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <IconPaths id={id} />
    </svg>
  );
}

export function isRailIconId(value: string): value is RailIconId {
  return [
    'resume', 'plan', 'prayer', 'group', 'notes', 'suggest',
    'assistant', 'challenge', 'plans', 'discover', 'devotional',
  ].includes(value);
}
