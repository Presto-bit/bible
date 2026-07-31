/** 成长区左媒矢量图标（与 rail 线标同 stroke 风格）。 */

import type { HomeMediaIconId } from '@/lib/home_media_visual';

type Props = {
  id: HomeMediaIconId;
  size?: number;
  className?: string;
};

const STROKE = 1.75;

function IconPaths({ id }: { id: HomeMediaIconId }) {
  switch (id) {
    case 'clock':
      return (
        <>
          <circle cx="12" cy="12" r="7.5" />
          <path d="M12 8.5v4l2.5 1.5" />
        </>
      );
    case 'compass':
      return (
        <>
          <circle cx="12" cy="12" r="7.5" />
          <path d="M14.8 9.2 13 13l-3.8 1.8L11 10.8z" />
        </>
      );
    case 'people':
      return (
        <>
          <circle cx="9" cy="8" r="2.2" />
          <circle cx="15.5" cy="8.5" r="1.8" />
          <path d="M4.8 17c.7-2.4 2.3-3.7 4.2-3.7s3.5 1.3 4.2 3.7" />
          <path d="M14 13.6c1.5.2 2.7 1.2 3.3 3.4" />
        </>
      );
    case 'calendar':
      return (
        <>
          <rect x="5" y="6" width="14" height="13" rx="2" />
          <path d="M8 4.5v3M16 4.5v3M5 10.5h14" />
          <path d="M9 14h2.5M13.5 14H15" />
        </>
      );
    case 'book':
      return (
        <>
          <path d="M6 5.5h9a2 2 0 0 1 2 2v11a2 2 0 0 0-2-2H6V5.5z" />
          <path d="M6 5.5v13" />
          <path d="M9 9h4M9 12h3" />
        </>
      );
    case 'footprint':
      return (
        <>
          <path d="M8.2 7.2c1.2-1.6 3.2-1.5 4 .2.6 1.4-.2 2.8-1.4 3.4" />
          <path d="M9.2 12.2c-.2 1.6.6 3.2 2 4.1" />
          <path d="M13.5 9.5c1.4-1.2 3.2-.8 3.8.8.5 1.3-.3 2.6-1.5 3.1" />
          <path d="M14.8 14c0 1.5.7 2.9 2 3.7" />
        </>
      );
    case 'spark':
      return (
        <>
          <path d="M12 4.5 13.2 9.2 18 10.5 13.2 11.8 12 16.5 10.8 11.8 6 10.5 10.8 9.2z" />
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
    default:
      return <circle cx="12" cy="12" r="6" />;
  }
}

export function HomeMediaIcon({ id, size = 28, className }: Props) {
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
